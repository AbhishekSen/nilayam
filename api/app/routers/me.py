"""GET /api/me — current user's profile, tier, and quota status."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from api.app.auth import CurrentUser, get_current_user
from api.app.services import usage

router = APIRouter(prefix="/api", tags=["me"])


class ChatQuota(BaseModel):
    limit: Optional[int]
    used: int
    window_days: int


class MeResponse(BaseModel):
    id: str
    email: str
    tier: str
    subscription_status: Optional[str]
    current_period_end: Optional[datetime]
    chat_quota: ChatQuota


@router.get("/me", response_model=MeResponse)
def get_me(user: CurrentUser = Depends(get_current_user)) -> MeResponse:
    effective = user.effective_tier
    used = usage.count_recent_chats(user.id)
    return MeResponse(
        id=user.id,
        email=user.email,
        tier=effective,
        subscription_status=user.subscription_status,
        current_period_end=user.current_period_end,
        chat_quota=ChatQuota(
            limit=usage.FREE_TIER_LIMIT if effective == "free" else None,
            used=used,
            window_days=usage.FREE_TIER_WINDOW.days,
        ),
    )
