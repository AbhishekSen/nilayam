"""Chat usage tracking — rolling 7-day quota for free-tier users."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from api.app.db import get_client

FREE_TIER_LIMIT = 5
FREE_TIER_WINDOW = timedelta(days=7)


def count_recent_chats(user_id: str) -> int:
    cutoff = (datetime.now(timezone.utc) - FREE_TIER_WINDOW).isoformat()
    res = (
        get_client()
        .table("chat_usage")
        .select("id", count="exact")
        .eq("user_id", user_id)
        .gte("created_at", cutoff)
        .execute()
    )
    return res.count or 0


def record_chat(user_id: str) -> None:
    get_client().table("chat_usage").insert({"user_id": user_id}).execute()
