"""
Pinecone client singleton.
"""
from functools import lru_cache
from pinecone import Pinecone
from app.config import settings


@lru_cache(maxsize=1)
def get_pinecone_index():
    """Return a cached Pinecone Index instance."""
    if not settings.pinecone_api_key:
        raise RuntimeError("PINECONE_API_KEY not configured")

    pc = Pinecone(api_key=settings.pinecone_api_key)
    return pc.Index(settings.pinecone_index_name)
