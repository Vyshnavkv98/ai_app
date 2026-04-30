"""
Short-term conversation memory backed by Redis.
Stores the last 20 message turns per session with a 2-hour TTL.
"""
import json
import redis.asyncio as aioredis
from typing import List
from app.config import settings

MEMORY_TTL = 7200   # 2 hours
MAX_TURNS = 20      # sliding window


class MemoryService:
    def __init__(self):
        self._redis: aioredis.Redis | None = None

    def _get_redis(self) -> aioredis.Redis:
        if self._redis is None:
            self._redis = aioredis.from_url(
                settings.redis_url,
                encoding="utf-8",
                decode_responses=True,
            )
        return self._redis

    def _key(self, session_id: str) -> str:
        return f"memory:session:{session_id}"

    async def get(self, session_id: str) -> List[dict]:
        """Return the stored message history for a session (max 20 turns)."""
        try:
            raw = await self._get_redis().get(self._key(session_id))
            if not raw:
                return []
            return json.loads(raw)
        except Exception:
            return []

    async def append(self, session_id: str, new_turns: List[dict]) -> None:
        """Append new turns and enforce the 20-turn sliding window."""
        try:
            existing = await self.get(session_id)
            updated = (existing + new_turns)[-MAX_TURNS:]
            await self._get_redis().setex(
                self._key(session_id),
                MEMORY_TTL,
                json.dumps(updated),
            )
        except Exception:
            pass  # memory failure must never break the chat flow

    async def clear(self, session_id: str) -> None:
        """Delete the memory for a session."""
        try:
            await self._get_redis().delete(self._key(session_id))
        except Exception:
            pass
