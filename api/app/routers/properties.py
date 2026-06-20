from __future__ import annotations

from fastapi import APIRouter, Depends

from api.app.auth import CurrentUser, get_current_user
from api.app.models import PropertySummary
from api.app.services.data import load_projects_records

router = APIRouter(prefix="/api", tags=["properties"])


@router.get("/properties", response_model=list[PropertySummary])
def list_properties(user: CurrentUser = Depends(get_current_user)) -> list[dict]:
    return load_projects_records()
