"""CRUD for the `profiles` table (one row per auth.users user)."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from api.app.db import get_client


def get_profile(user_id: str) -> Optional[dict]:
    res = (
        get_client()
        .table("profiles")
        .select("*")
        .eq("id", user_id)
        .limit(1)
        .execute()
    )
    rows = res.data or []
    return rows[0] if rows else None


def get_profile_by_stripe_customer(customer_id: str) -> Optional[dict]:
    res = (
        get_client()
        .table("profiles")
        .select("*")
        .eq("stripe_customer_id", customer_id)
        .limit(1)
        .execute()
    )
    rows = res.data or []
    return rows[0] if rows else None


def create_profile(user_id: str, email: str) -> dict:
    res = (
        get_client()
        .table("profiles")
        .upsert({"id": user_id, "email": email}, on_conflict="id")
        .execute()
    )
    rows = res.data or []
    return rows[0] if rows else {"id": user_id, "email": email, "tier": "free"}


def set_stripe_customer(user_id: str, customer_id: str) -> None:
    get_client().table("profiles").update(
        {"stripe_customer_id": customer_id}
    ).eq("id", user_id).execute()


def update_subscription(
    user_id: str,
    *,
    tier: str,
    stripe_subscription_id: Optional[str],
    subscription_status: Optional[str],
    current_period_end: Optional[datetime],
) -> None:
    payload: dict = {
        "tier": tier,
        "stripe_subscription_id": stripe_subscription_id,
        "subscription_status": subscription_status,
    }
    if current_period_end is not None:
        payload["current_period_end"] = current_period_end.isoformat()
    get_client().table("profiles").update(payload).eq("id", user_id).execute()
