"""
Base agent infrastructure for the DUPE Agentic Business Platform.

All agents inherit from BaseAgent which provides:
- Structured result format
- Audit logging to AgentAuditLogORM
- LLM call helper (Claude API with rule-based fallback)
- Timing and confidence tracking
"""
from __future__ import annotations
import json
import logging
import os
import time
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger("dupe.agents")


@dataclass
class AgentResult:
    """Standard result envelope returned by every agent action."""
    agent_name: str
    action: str
    success: bool
    data: dict[str, Any]
    confidence: int = 0          # 0–100
    llm_used: bool = False
    duration_ms: int = 0
    error: str = ""
    run_id: str = field(default_factory=lambda: str(uuid4()))


class BaseAgent:
    """
    Base class for all DUPE agents.
    Subclasses implement specific domain logic; this base handles
    cross-cutting concerns: LLM access, audit logging, result wrapping.
    """
    name: str = "BaseAgent"

    def __init__(self, db: AsyncSession):
        self.db = db
        self._api_key = os.getenv("ANTHROPIC_API_KEY", "")

    @property
    def has_llm(self) -> bool:
        return bool(self._api_key)

    async def call_llm(
        self,
        prompt: str,
        max_tokens: int = 600,
        model: str = "claude-haiku-4-5-20251001",
    ) -> tuple[str, bool]:
        """
        Call the Anthropic API.
        Returns (response_text, used_llm).
        Returns ("", False) if no API key or call fails.
        """
        if not self._api_key:
            return "", False
        try:
            import httpx
            async with httpx.AsyncClient(timeout=30.0) as client:
                r = await client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={
                        "x-api-key": self._api_key,
                        "anthropic-version": "2023-06-01",
                        "content-type": "application/json",
                    },
                    json={
                        "model": model,
                        "max_tokens": max_tokens,
                        "messages": [{"role": "user", "content": prompt}],
                    },
                )
                data = r.json()
                text = data["content"][0]["text"]
                return text, True
        except Exception as exc:
            logger.warning("[%s] LLM call failed: %s — falling back to rule-based", self.name, exc)
            return "", False

    async def _log_audit(
        self,
        action: str,
        entity_type: str | None,
        entity_id: str | None,
        input_summary: str,
        output_summary: str,
        confidence: int,
        llm_used: bool,
        duration_ms: int,
        run_id: str,
        status: str = "success",
        error: str = "",
    ) -> None:
        from dupe_platform.adapters.outbound.persistence.models import AgentAuditLogORM
        log = AgentAuditLogORM(
            id=uuid4(),
            agent_name=self.name,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            input_summary=input_summary[:500],
            output_summary=output_summary[:500],
            confidence_score=confidence,
            llm_used=llm_used,
            duration_ms=duration_ms,
            status=status,
            error_message=error[:500],
        )
        self.db.add(log)
        await self.db.flush()

    def _timed(self) -> float:
        return time.monotonic()

    def _elapsed_ms(self, start: float) -> int:
        return int((time.monotonic() - start) * 1000)
