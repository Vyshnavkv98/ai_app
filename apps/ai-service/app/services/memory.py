"""
Short-term conversation memory backed by Redis.
Stores the last 20 message turns per session with a 2-hour TTL.
Long-term memory stores significant turns as vector embeddings in Pinecone.
"""
import json
import redis.asyncio as aioredis
from typing import List, Optional
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
        """
        Append new turns and enforce the 20-turn sliding window.
        Invariant: len(memory) <= MAX_TURNS after every call.
        """
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

    # ── Long-term memory (Pinecone) ───────────────────────────────────────────

    async def store_long_term(self, session_id: str, workspace_id: str, turn: dict) -> None:
        """
        Embed a significant conversation turn and upsert to Pinecone for long-term retrieval.
        Only stores assistant turns (responses) to avoid noise.
        """
        if not settings.pinecone_api_key or not settings.openai_api_key:
            return
        if turn.get("role") != "assistant":
            return

        try:
            from openai import AsyncOpenAI
            from app.services.pinecone_client import get_pinecone_index
            import hashlib

            client = AsyncOpenAI(api_key=settings.openai_api_key)
            text = turn.get("content", "")
            if not text.strip():
                return

            embedding_response = await client.embeddings.create(
                input=text[:8000],  # truncate to avoid token limits
                model="text-embedding-3-small",
            )
            vector = embedding_response.data[0].embedding

            # Deterministic ID based on session + content hash
            content_hash = hashlib.md5(text.encode()).hexdigest()[:8]
            vector_id = f"mem:{session_id}:{content_hash}"

            index = get_pinecone_index()
            index.upsert(
                vectors=[{
                    "id": vector_id,
                    "values": vector,
                    "metadata": {
                        "session_id": session_id,
                        "workspace_id": workspace_id,
                        "role": turn.get("role"),
                        "text": text[:1000],  # store first 1000 chars as metadata
                        "type": "long_term_memory",
                    },
                }],
                namespace=workspace_id,
            )
        except Exception:
            pass  # long-term memory failure is non-fatal

    async def retrieve_long_term(
        self, query: str, workspace_id: str, session_id: Optional[str] = None, top_k: int = 3
    ) -> List[dict]:
        """Retrieve relevant long-term memories for a query."""
        if not settings.pinecone_api_key or not settings.openai_api_key:
            return []

        try:
            from openai import AsyncOpenAI
            from app.services.pinecone_client import get_pinecone_index

            client = AsyncOpenAI(api_key=settings.openai_api_key)
            embedding_response = await client.embeddings.create(
                input=query,
                model="text-embedding-3-small",
            )
            query_vector = embedding_response.data[0].embedding

            index = get_pinecone_index()
            filter_dict: dict = {"type": {"$eq": "long_term_memory"}}
            if session_id:
                filter_dict["session_id"] = {"$eq": session_id}

            results = index.query(
                vector=query_vector,
                top_k=top_k,
                namespace=workspace_id,
                include_metadata=True,
                filter=filter_dict,
            )

            return [
                {"text": m.metadata.get("text", ""), "score": m.score}
                for m in results.matches
                if m.metadata
            ]
        except Exception:
            return []
