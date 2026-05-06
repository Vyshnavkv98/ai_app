"""
RAG retrieval service — generates query embedding and fetches top-K chunks from Pinecone.
"""
from typing import Optional
from openai import AsyncOpenAI
from app.config import settings
from app.services.pinecone_client import get_pinecone_index


async def retrieve_context(
    query: str,
    workspace_id: str,
    top_k: int = 5,
) -> Optional[str]:
    """
    Embed the query, search Pinecone, and return a formatted context string.
    Returns None if Pinecone is not configured or no results found.
    """
    if not settings.pinecone_api_key or not settings.openai_api_key:
        return None

    try:
        # Generate query embedding
        client = AsyncOpenAI(api_key=settings.openai_api_key)
        embedding_response = await client.embeddings.create(
            input=query,
            model="text-embedding-3-small",
        )
        query_vector = embedding_response.data[0].embedding

        # Search Pinecone in workspace namespace
        index = get_pinecone_index()
        results = index.query(
            vector=query_vector,
            top_k=top_k,
            namespace=workspace_id,
            include_metadata=True,
        )

        if not results.matches:
            return None

        # Format chunks as numbered context blocks
        chunks = []
        for i, match in enumerate(results.matches, 1):
            text = match.metadata.get("text", "") if match.metadata else ""
            if text.strip():
                chunks.append(f"[{i}] {text.strip()}")

        return "\n\n".join(chunks) if chunks else None

    except Exception:
        # RAG failure is non-fatal — fall back to plain chat
        return None
