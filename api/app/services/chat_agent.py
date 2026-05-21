"""Property-data chat agent.

Wires the OpenAI Agents SDK to:
  - Supabase MCP server (hosted, read-only) for SQL access to `projects_blr`.
  - Hosted code interpreter, so the model can render PNG charts when the question
    is better answered visually.

Phase 1: single-turn `run()` that returns final text + any PNG images produced.
"""
from __future__ import annotations

import base64
import os
from dataclasses import dataclass
from typing import Any, AsyncIterator, Optional

from agents import Agent, CodeInterpreterTool, HostedMCPTool, Runner
from openai import AsyncOpenAI

SYSTEM_PROMPT = """\
You are a real-estate analyst answering questions about Bengaluru property projects.

You have two tools:
  1. A Supabase MCP connection to a read-only Postgres database. The only relevant
     table is `public.projects_blr`. Use `list_tables` if uncertain about columns,
     then `execute_sql` to run a SELECT.
  2. A code interpreter (Python + matplotlib + pandas) for generating charts
     and doing follow-up analysis on query results.

# Schema (projects_blr — Bengaluru projects)

| column                    | notes                                                      |
|---------------------------|------------------------------------------------------------|
| id                        | int, primary key                                           |
| name, slug                | display name + URL slug                                    |
| image, alt                | hero image URL + alt text                                  |
| developerName             | builder name (e.g. "Prestige Constructions")               |
| developerGrade            | categorical A/B/C/D/G (A is best, G is unrated)            |
| projectStatus             | "available", "sold_out", etc.                              |
| possessionDate            | timestamptz, when units hand over                          |
| city                      | always "Bengaluru" right now                               |
| micromarket               | neighborhood (e.g. "Whitefield", "JP Nagar")               |
| latitude, longitude       | float, may be null                                         |
| minPrice, maxPrice        | rupees, integer-ish floats                                 |
| minSaleableArea, maxSaleableArea | sqft                                                |
| typologies                | STRING that looks like a JSON array: '["1BHK","2BHK"]'.    |
|                           | Use `"typologies"::jsonb ? '2BHK'` to filter for a type.   |
| propscore                 | float ~1.5–4.5, higher is better                           |
| popularity                | categorical "A" (popular) or "Z"                           |
| micromarketPriceAverage   | benchmark ₹/sqft for the micromarket                       |
| metroProximity            | km to nearest metro station                                |
| unitDensity               | units per acre                                             |
| landArea                  | acres                                                      |
| petPark, squash, pharmacy, basketball, heatedPool | 0/1 amenity flags          |

To derive price-per-sqft: `minPrice / minSaleableArea`.

# Rules

- Always wrap identifiers in double quotes since they are camelCase (`"minPrice"`, not `minPrice`).
- Default to `LIMIT 200` on any SELECT unless the user asks for more.
- For aggregate questions, GROUP BY in SQL — don't pull all rows into the code interpreter.
- When the user asks for a chart, plot, graph, comparison-across-many-things,
  or anything inherently visual: run the SQL, pass the result to the code
  interpreter, and produce a single clean PNG (matplotlib, 10x6, tight layout,
  axis labels, title). Then briefly describe what the chart shows in 2–3 sentences.
- Never write "[Download the chart](sandbox:/...)" or other sandbox links — the
  PNG is delivered inline to the UI automatically. Just describe what it shows.
- Format prices as ₹X.X Cr (≥1 Cr) or ₹XL (< 1 Cr) in your prose. ₹1L = ₹100,000.
- Cite the SQL you ran in a fenced ```sql block at the end of the response.
- Never invent column names. If a query errors with "column does not exist",
  re-check the schema above before retrying.
- You are READ-ONLY. Never issue INSERT/UPDATE/DELETE/DDL.
"""


@dataclass
class ChatResult:
    text: str
    images: list[dict]  # [{ "mime": "image/png", "b64": "..." }]
    response_id: Optional[str]


def _build_agent() -> Agent[None]:
    project_ref = os.environ.get("SUPABASE_PROJECT_REF", "")
    access_token = os.environ.get("SUPABASE_ACCESS_TOKEN", "")
    model = os.environ.get("CHAT_MODEL", "gpt-4o-mini")

    if not project_ref or not access_token:
        raise RuntimeError(
            "SUPABASE_PROJECT_REF and SUPABASE_ACCESS_TOKEN must be set for the chat agent."
        )

    server_url = (
        f"https://mcp.supabase.com/mcp"
        f"?project_ref={project_ref}&read_only=true&features=database"
    )

    return Agent(
        name="Propsoch Property Chat",
        instructions=SYSTEM_PROMPT,
        model=model,
        tools=[
            HostedMCPTool(
                tool_config={
                    "type": "mcp",
                    "server_label": "supabase",
                    "server_url": server_url,
                    "headers": {"Authorization": f"Bearer {access_token}"},
                    "require_approval": "never",
                    "allowed_tools": ["list_tables", "execute_sql", "list_extensions"],
                }
            ),
            CodeInterpreterTool(
                tool_config={
                    "type": "code_interpreter",
                    "container": {"type": "auto"},
                }
            ),
        ],
    )


async def _extract_images(result: Any) -> list[dict]:
    """Walk the raw responses for code-interpreter file outputs and download them
    as base64 PNGs. Best-effort: silently skips anything it can't fetch."""
    images: list[dict] = []
    client = AsyncOpenAI()
    seen: set[tuple[str, str]] = set()

    for resp in getattr(result, "raw_responses", None) or []:
        for item in getattr(resp, "output", None) or []:
            item_type = getattr(item, "type", None)
            container_id = getattr(item, "container_id", None)

            # Code interpreter call may carry outputs/results with image file_ids.
            outputs = (
                getattr(item, "outputs", None)
                or getattr(item, "results", None)
                or []
            )
            for out in outputs:
                if getattr(out, "type", None) != "image":
                    continue
                file_id = getattr(out, "file_id", None)
                if not file_id or not container_id:
                    continue
                key = (container_id, file_id)
                if key in seen:
                    continue
                seen.add(key)
                try:
                    data = await client.containers.files.content.retrieve(
                        file_id, container_id=container_id
                    )
                    raw = await data.aread() if hasattr(data, "aread") else data.read()
                    images.append(
                        {
                            "mime": "image/png",
                            "b64": base64.b64encode(raw).decode("ascii"),
                        }
                    )
                except Exception:  # noqa: BLE001 — best-effort image extraction
                    continue

            # Assistant messages may also reference container files via annotations.
            if item_type == "message":
                for content in getattr(item, "content", None) or []:
                    for ann in getattr(content, "annotations", None) or []:
                        if getattr(ann, "type", None) != "container_file_citation":
                            continue
                        cid = getattr(ann, "container_id", None)
                        fid = getattr(ann, "file_id", None)
                        if not cid or not fid:
                            continue
                        key = (cid, fid)
                        if key in seen:
                            continue
                        seen.add(key)
                        try:
                            data = await client.containers.files.content.retrieve(
                                fid, container_id=cid
                            )
                            raw = (
                                await data.aread()
                                if hasattr(data, "aread")
                                else data.read()
                            )
                            images.append(
                                {
                                    "mime": "image/png",
                                    "b64": base64.b64encode(raw).decode("ascii"),
                                }
                            )
                        except Exception:  # noqa: BLE001
                            continue

    return images


async def ask(message: str, previous_response_id: Optional[str] = None) -> ChatResult:
    """Run one turn of the property-data agent. Pass `previous_response_id` to
    continue an existing OpenAI Responses conversation."""
    agent = _build_agent()
    result = await Runner.run(
        agent,
        input=message,
        previous_response_id=previous_response_id,
        max_turns=10,
    )
    text = (result.final_output or "") if result.final_output is not None else ""
    images = await _extract_images(result)
    return ChatResult(
        text=text if isinstance(text, str) else str(text),
        images=images,
        response_id=getattr(result, "last_response_id", None),
    )


def _tool_label(item: Any) -> Optional[str]:
    """Map a `tool_called` RunItem to a short human label for the UI."""
    raw = getattr(item, "raw_item", None)
    raw_type = getattr(raw, "type", None)
    if raw_type == "mcp_call":
        name = getattr(raw, "name", "") or ""
        if name == "execute_sql":
            return "Querying database…"
        if name == "list_tables":
            return "Inspecting schema…"
        if name:
            return f"MCP: {name}"
        return "Calling Supabase MCP…"
    if raw_type == "code_interpreter_call":
        return "Running Python…"
    if raw_type == "function_call":
        return f"Calling {getattr(raw, 'name', 'tool')}…"
    return None


async def stream(
    message: str, previous_response_id: Optional[str] = None
) -> AsyncIterator[dict]:
    """Yield structured events as the agent runs:
      {event: "text",  data: {delta: str}}
      {event: "tool",  data: {label: str}}
      {event: "image", data: {mime: str, b64: str}}
      {event: "done",  data: {response_id: str | None}}
      {event: "error", data: {message: str}}
    """
    agent = _build_agent()
    streamed = Runner.run_streamed(
        agent,
        input=message,
        previous_response_id=previous_response_id,
        max_turns=10,
    )
    try:
        async for event in streamed.stream_events():
            if event.type == "raw_response_event":
                raw = event.data
                raw_type = getattr(raw, "type", "")
                if raw_type == "response.output_text.delta":
                    delta = getattr(raw, "delta", "") or ""
                    if delta:
                        yield {"event": "text", "data": {"delta": delta}}
            elif event.type == "run_item_stream_event":
                if event.name == "tool_called":
                    label = _tool_label(event.item)
                    if label:
                        yield {"event": "tool", "data": {"label": label}}
        # Streaming finished — fetch any code-interpreter images now that the
        # response is fully formed.
        images = await _extract_images(streamed)
        for img in images:
            yield {"event": "image", "data": img}
        yield {
            "event": "done",
            "data": {"response_id": getattr(streamed, "last_response_id", None)},
        }
    except Exception as exc:  # noqa: BLE001 — translate any failure into one SSE event
        yield {"event": "error", "data": {"message": str(exc)}}
