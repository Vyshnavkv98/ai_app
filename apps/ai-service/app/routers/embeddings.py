from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Optional

router = APIRouter()


class EmbeddingRequest(BaseModel):
    texts: List[str]
    model: str = "text-embedding-3-small"


@router.post("/embeddings")
async def generate_embeddings(request: EmbeddingRequest):
    """Generate embeddings — implemented in Task 9."""
    return {"embeddings": [], "model": request.model}
