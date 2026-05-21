"""POST /api/chat — SSE-streaming property-data chat endpoint.

Request body:  { "message": str, "previous_response_id"?: str | null }
Response:      text/event-stream with named events:
                 event: text   data: {"delta": "…"}
                 event: tool   data: {"label": "Querying database…"}
                 event: image  data: {"mime": "image/png", "b64": "…"}
                 event: done   data: {"response_id": "…"}
                 event: error  data: {"message": "…"}
"""
from __future__ import annotations

import json
import logging
import time
from typing import AsyncIterator, Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from api.app.services.chat_agent import stream as agent_stream
from api.app.services.rate_limit import get_limiter

logger = logging.getLogger("propsoch.chat")

router = APIRouter(prefix="/api", tags=["chat"])


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    previous_response_id: Optional[str] = None


def _format_sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


async def _sse_generator(req: ChatRequest, ip: str) -> AsyncIterator[str]:
    started = time.monotonic()
    text_chars = 0
    image_count = 0
    tool_calls = 0
    error_msg: Optional[str] = None
    try:
        async for evt in agent_stream(
            req.message, previous_response_id=req.previous_response_id
        ):
            if evt["event"] == "text":
                text_chars += len(evt["data"].get("delta", ""))
            elif evt["event"] == "image":
                image_count += 1
            elif evt["event"] == "tool":
                tool_calls += 1
            elif evt["event"] == "error":
                error_msg = evt["data"].get("message", "")
            yield _format_sse(evt["event"], evt["data"])
    except Exception as exc:  # noqa: BLE001
        error_msg = str(exc)
        yield _format_sse("error", {"message": error_msg})
    finally:
        logger.info(
            "chat ip=%s ms=%d chars=%d images=%d tools=%d error=%r msg=%r",
            ip,
            int((time.monotonic() - started) * 1000),
            text_chars,
            image_count,
            tool_calls,
            error_msg,
            req.message[:120],
        )


@router.post("/chat")
async def chat(req: ChatRequest, request: Request) -> StreamingResponse:
    ip = request.client.host if request.client else "unknown"
    allowed, msg = get_limiter().check(ip)
    if not allowed:
        raise HTTPException(status_code=429, detail=msg)
    return StreamingResponse(
        _sse_generator(req, ip),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # disable proxy buffering when behind nginx
        },
    )
