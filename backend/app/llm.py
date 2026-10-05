"""DeepSeek access through the OpenAI-compatible SDK.

Only LLM_BASE_URL / LLM_API_KEY / LLM_MODEL are used; no model name or key is hardcoded and no
other provider is imported.
"""

from __future__ import annotations

import asyncio
import json
import re
from collections.abc import Awaitable, Callable
from typing import Any

from openai import AsyncOpenAI

from app.config import get_settings


class LLMNotConfiguredError(RuntimeError):
    pass


class LLMOutputError(RuntimeError):
    """The model did not return parseable JSON after retries."""


_client: AsyncOpenAI | None = None
_client_key: tuple[str, str] | None = None
_semaphore: asyncio.Semaphore | None = None


def reset_client() -> None:
    """Drop the cached client/semaphore (settings changed, or a new event loop in tests)."""
    global _client, _client_key, _semaphore
    _client = None
    _client_key = None
    _semaphore = None


def _get_client() -> tuple[AsyncOpenAI, asyncio.Semaphore]:
    global _client, _client_key, _semaphore
    settings = get_settings()
    if not settings.llm_configured:
        raise LLMNotConfiguredError("Set LLM_BASE_URL, LLM_API_KEY and LLM_MODEL")
    key = (settings.llm_base_url, settings.llm_api_key)
    if _client is None or _client_key != key:
        _client = AsyncOpenAI(
            base_url=settings.llm_base_url,
            api_key=settings.llm_api_key,
            timeout=settings.llm_timeout_seconds,
            max_retries=2,
        )
        _client_key = key
    if _semaphore is None:
        _semaphore = asyncio.Semaphore(settings.llm_concurrency)
    return _client, _semaphore


async def chat(
    messages: list[dict[str, Any]],
    *,
    tools: list[dict[str, Any]] | None = None,
    json_mode: bool = False,
    temperature: float = 0.2,
    max_tokens: int = 8192,
) -> Any:
    """One chat-completion call; returns the first choice's message."""
    client, sem = _get_client()
    kwargs: dict[str, Any] = {
        "model": get_settings().llm_model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if tools:
        kwargs["tools"] = tools
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}
    async with sem:
        resp = await client.chat.completions.create(**kwargs)
    return resp.choices[0].message


_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE)


def parse_json_object(text: str) -> dict[str, Any]:
    """Parse a JSON object from model output, tolerating code fences and surrounding prose."""
    cleaned = _FENCE.sub("", text.strip())
    try:
        value = json.loads(cleaned)
    except json.JSONDecodeError:
        start, end = cleaned.find("{"), cleaned.rfind("}")
        if start == -1 or end <= start:
            raise LLMOutputError("no JSON object in model output") from None
        try:
            value = json.loads(cleaned[start : end + 1])
        except json.JSONDecodeError as exc:
            raise LLMOutputError(f"invalid JSON from model: {exc}") from exc
    if not isinstance(value, dict):
        raise LLMOutputError("model output is not a JSON object")
    return value


async def chat_json(messages: list[dict[str, Any]], *, retries: int = 1, max_tokens: int = 8192) -> dict[str, Any]:
    """Ask for a JSON object; on a parse failure, show the model its error once and retry."""
    convo = list(messages)
    last: Exception | None = None
    for _ in range(retries + 1):
        msg = await chat(convo, json_mode=True, max_tokens=max_tokens)
        text = msg.content or ""
        try:
            return parse_json_object(text)
        except LLMOutputError as exc:
            last = exc
            convo = [*convo, {"role": "assistant", "content": text},
                     {"role": "user", "content": f"Your reply was not valid JSON ({exc}). Reply again with only the JSON object."}]
    raise LLMOutputError(str(last))


ToolHandler = Callable[[str, dict[str, Any]], Awaitable[str]]


async def run_tool_loop(
    messages: list[dict[str, Any]],
    tools: list[dict[str, Any]],
    handler: ToolHandler,
    *,
    max_turns: int = 6,
    on_tool: Callable[[str, dict[str, Any]], None] | None = None,
) -> tuple[list[dict[str, Any]], str | None]:
    """Let the model call tools until it stops asking (or max_turns).

    Returns the transcript and the model's final text reply (None if it ran out of turns).
    """
    convo = list(messages)
    for _ in range(max_turns):
        msg = await chat(convo, tools=tools)
        calls = getattr(msg, "tool_calls", None) or []
        if not calls:
            return convo, msg.content or ""
        convo.append({
            "role": "assistant",
            "content": msg.content or "",
            "tool_calls": [
                {"id": c.id, "type": "function", "function": {"name": c.function.name, "arguments": c.function.arguments}}
                for c in calls
            ],
        })
        results = await asyncio.gather(*(_call_tool(c, handler, on_tool) for c in calls))
        for call, result in zip(calls, results, strict=True):
            convo.append({"role": "tool", "tool_call_id": call.id, "content": result})
    return convo, None


async def _call_tool(call: Any, handler: ToolHandler, on_tool: Callable[[str, dict[str, Any]], None] | None) -> str:
    name = call.function.name
    try:
        args = json.loads(call.function.arguments or "{}")
        if not isinstance(args, dict):
            raise ValueError("arguments must be an object")
    except (json.JSONDecodeError, ValueError) as exc:
        return f"ERROR: invalid tool arguments: {exc}"
    if on_tool:
        on_tool(name, args)
    try:
        return await handler(name, args)
    except Exception as exc:  # tool errors are reported to the model, not raised
        return f"ERROR: {exc}"
