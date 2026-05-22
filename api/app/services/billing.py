"""Stripe wrapper: Checkout, Customer Portal, and webhook event handling."""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Optional

import stripe
from fastapi import HTTPException

from api.app.auth import CurrentUser
from api.app.services import profiles

logger = logging.getLogger("propsoch.billing")


def _stripe() -> stripe.StripeClient:
    key = os.environ.get("STRIPE_SECRET_KEY")
    if not key:
        raise HTTPException(500, "STRIPE_SECRET_KEY not configured")
    return stripe.StripeClient(key)


def _app_url() -> str:
    return os.environ.get("APP_URL", "http://localhost:5173").rstrip("/")


def _ensure_customer(user: CurrentUser) -> str:
    profile = profiles.get_profile(user.id) or {}
    existing = profile.get("stripe_customer_id")
    if existing:
        return existing
    customer = _stripe().customers.create(
        params={"email": user.email, "metadata": {"supabase_user_id": user.id}}
    )
    profiles.set_stripe_customer(user.id, customer.id)
    return customer.id


def create_checkout_session(user: CurrentUser) -> str:
    price_id = os.environ.get("STRIPE_PRICE_ID_PAID")
    if not price_id:
        raise HTTPException(500, "STRIPE_PRICE_ID_PAID not configured")
    customer_id = _ensure_customer(user)
    session = _stripe().checkout.sessions.create(
        params={
            "mode": "subscription",
            "customer": customer_id,
            "line_items": [{"price": price_id, "quantity": 1}],
            "success_url": f"{_app_url()}/billing?success=1",
            "cancel_url": f"{_app_url()}/billing?canceled=1",
            "client_reference_id": user.id,
            "allow_promotion_codes": True,
        }
    )
    if not session.url:
        raise HTTPException(500, "Stripe did not return a Checkout URL")
    return session.url


def create_portal_session(user: CurrentUser) -> str:
    profile = profiles.get_profile(user.id) or {}
    customer_id = profile.get("stripe_customer_id")
    if not customer_id:
        raise HTTPException(400, "No Stripe customer for this user")
    session = _stripe().billing_portal.sessions.create(
        params={
            "customer": customer_id,
            "return_url": f"{_app_url()}/billing",
        }
    )
    return session.url


def handle_webhook(payload: bytes, signature: Optional[str]) -> None:
    secret = os.environ.get("STRIPE_WEBHOOK_SECRET")
    if not secret:
        raise HTTPException(500, "STRIPE_WEBHOOK_SECRET not configured")
    if not signature:
        raise HTTPException(400, "Missing Stripe signature header")
    try:
        event = stripe.Webhook.construct_event(payload, signature, secret)
    except (ValueError, stripe.SignatureVerificationError) as exc:
        raise HTTPException(400, f"Webhook signature verification failed: {exc}")

    event_type = event.type
    obj = event.data.object
    logger.info("stripe webhook event=%s id=%s", event_type, event.id)

    if event_type == "checkout.session.completed":
        _handle_checkout_completed(obj)
    elif event_type in (
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
    ):
        _handle_subscription_change(obj)
    elif event_type == "invoice.payment_failed":
        _handle_payment_failed(obj)
    # Other events ignored; Stripe doesn't require us to handle them.


def _user_id_from_customer(customer_id: Optional[str]) -> Optional[str]:
    if not customer_id:
        return None
    profile = profiles.get_profile_by_stripe_customer(customer_id)
    return profile["id"] if profile else None


def _handle_checkout_completed(session) -> None:
    user_id = getattr(session, "client_reference_id", None) or _user_id_from_customer(
        getattr(session, "customer", None)
    )
    if not user_id:
        logger.warning("checkout.session.completed missing user_id; session=%s", getattr(session, "id", None))
        return
    subscription_id = getattr(session, "subscription", None)
    profiles.update_subscription(
        user_id,
        tier="paid",
        stripe_subscription_id=subscription_id if isinstance(subscription_id, str) else None,
        subscription_status="active",
        current_period_end=None,
    )


def _handle_subscription_change(sub) -> None:
    user_id = _user_id_from_customer(getattr(sub, "customer", None))
    if not user_id:
        logger.warning("subscription event missing user; sub=%s", getattr(sub, "id", None))
        return
    status = getattr(sub, "status", None)
    period_end_ts = getattr(sub, "current_period_end", None)
    period_end = (
        datetime.fromtimestamp(period_end_ts, tz=timezone.utc) if period_end_ts else None
    )
    # Keep tier='paid' while access window is still open; flip to free only when
    # both status is terminal and the period has fully ended.
    tier = "paid"
    if status in ("canceled", "unpaid", "incomplete_expired"):
        if not period_end or period_end <= datetime.now(timezone.utc):
            tier = "free"
    profiles.update_subscription(
        user_id,
        tier=tier,
        stripe_subscription_id=getattr(sub, "id", None),
        subscription_status=status,
        current_period_end=period_end,
    )


def _handle_payment_failed(invoice) -> None:
    user_id = _user_id_from_customer(getattr(invoice, "customer", None))
    if not user_id:
        return
    profile = profiles.get_profile(user_id) or {}
    profiles.update_subscription(
        user_id,
        tier=profile.get("tier", "paid"),
        stripe_subscription_id=profile.get("stripe_subscription_id"),
        subscription_status="past_due",
        current_period_end=None,
    )
