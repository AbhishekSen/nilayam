from __future__ import annotations

import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.app.routers import analytics, billing, chat, me, properties

# Attach a stderr handler to propsoch.* loggers so chat request lines surface
# alongside uvicorn's access logs.
_propsoch_logger = logging.getLogger("propsoch")
if not _propsoch_logger.handlers:
    _handler = logging.StreamHandler()
    _handler.setFormatter(logging.Formatter("%(levelname)s:    %(message)s"))
    _propsoch_logger.addHandler(_handler)
    _propsoch_logger.setLevel(logging.INFO)
    _propsoch_logger.propagate = False

app = FastAPI(title="Propsoch API", version="0.1.0")

# CORS — explicit allowlist of frontend origins. In single-origin prod deploys
# this becomes redundant; in dev Vite proxies /api → :8000 so this is a backup.
allowed_origins = [
    o.strip()
    for o in os.environ.get(
        "ALLOWED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(me.router)
app.include_router(properties.router)
app.include_router(analytics.router)
app.include_router(chat.router)
app.include_router(billing.router)
