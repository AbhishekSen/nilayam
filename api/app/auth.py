"""FastAPI auth dependency.

Verifies the Supabase-issued JWT locally and loads the user's profile row.
Supports both ES256 (new asymmetric signing, verified via JWKS) and HS256
(legacy shared-secret signing, retained for backwards compat during the
Supabase migration). Algorithm is chosen per-token from the JWT header.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime, timezone
from functools import lru_cache
from typing import Optional

import jwt
from fastapi import Depends, Header, HTTPException, status

from api.app.services import profiles


@dataclass
class CurrentUser:
    id: str
    email: str
    tier: str
    subscription_status: Optional[str]
    current_period_end: Optional[datetime]

    @property
    def effective_tier(self) -> str:
        """Paid users keep access until current_period_end even after cancel."""
        if self.tier != "paid":
            return self.tier
        if self.subscription_status in ("active", "trialing", "past_due"):
            return "paid"
        if self.current_period_end and self.current_period_end > datetime.now(timezone.utc):
            return "paid"
        return "free"


@lru_cache(maxsize=1)
def _jwks_client() -> jwt.PyJWKClient:
    supabase_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    if not supabase_url:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Server misconfigured: SUPABASE_URL not set",
        )
    # PyJWKClient caches keys in-memory for 5 minutes by default.
    return jwt.PyJWKClient(f"{supabase_url}/auth/v1/.well-known/jwks.json")


def _decode_token(token: str) -> dict:
    try:
        header = jwt.get_unverified_header(token)
    except jwt.InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Invalid token: {exc}"
        )

    alg = header.get("alg")
    if alg in ("ES256", "RS256"):
        try:
            key = _jwks_client().get_signing_key_from_jwt(token).key
        except jwt.PyJWKClientError as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Could not resolve signing key: {exc}",
            )
    elif alg == "HS256":
        secret = os.environ.get("SUPABASE_JWT_SECRET")
        if not secret:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=(
                    "Received an HS256 token but SUPABASE_JWT_SECRET is not set. "
                    "Either set the legacy shared secret or rotate the Supabase "
                    "project to an asymmetric signing key."
                ),
            )
        key = secret
    else:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Unsupported token algorithm: {alg!r}",
        )

    try:
        return jwt.decode(
            token,
            key,
            algorithms=[alg],
            audience="authenticated",
            options={"require": ["exp", "sub"]},
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired")
    except jwt.InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Invalid token: {exc}"
        )


async def get_current_user(authorization: Optional[str] = Header(default=None)) -> CurrentUser:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = authorization.split(" ", 1)[1].strip()
    payload = _decode_token(token)
    user_id = payload["sub"]
    email = payload.get("email", "")

    profile = profiles.get_profile(user_id)
    if profile is None:
        # Trigger should have inserted on signup; fall back to lazy-create.
        profile = profiles.create_profile(user_id, email)

    return CurrentUser(
        id=user_id,
        email=email or profile.get("email", ""),
        tier=profile.get("tier", "free"),
        subscription_status=profile.get("subscription_status"),
        current_period_end=_parse_ts(profile.get("current_period_end")),
    )


def _parse_ts(value) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None


CurrentUserDep = Depends(get_current_user)
