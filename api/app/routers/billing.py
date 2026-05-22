"""Stripe billing endpoints."""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Header, Request
from pydantic import BaseModel

from api.app.auth import CurrentUser, get_current_user
from api.app.services import billing

logger = logging.getLogger("propsoch.billing")

router = APIRouter(prefix="/api/billing", tags=["billing"])


class CheckoutResponse(BaseModel):
    url: str


@router.post("/checkout", response_model=CheckoutResponse)
def create_checkout(user: CurrentUser = Depends(get_current_user)) -> CheckoutResponse:
    return CheckoutResponse(url=billing.create_checkout_session(user))


@router.post("/portal", response_model=CheckoutResponse)
def create_portal(user: CurrentUser = Depends(get_current_user)) -> CheckoutResponse:
    return CheckoutResponse(url=billing.create_portal_session(user))


@router.post("/webhook")
async def webhook(request: Request, stripe_signature: str = Header(default=None)) -> dict:
    payload = await request.body()
    try:
        billing.handle_webhook(payload, stripe_signature)
    except Exception as exc:
        logger.exception("Webhook handler crashed: %s", exc)
        raise
    return {"received": True}
