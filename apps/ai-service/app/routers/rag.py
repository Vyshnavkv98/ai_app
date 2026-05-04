import httpx
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional

from app.config import settings
from app.services.indexing import index_file, delete_file_vectors

router = APIRouter()


# ── Request models ────────────────────────────────────────────────────────────

class IndexRequest(BaseModel):
    file_id: str
    s3_key: str
    workspace_id: str


class QueryRequest(BaseModel):
    query: str
    workspace_id: str
    top_k: int = 5
    session_id: Optional[str] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _update_file_status(file_id: str, status: str, chunk_count: Optional[int] = None):
    """Notify the Express API to update the file's indexStatus in PostgreSQL."""
    try:
        payload = {"indexStatus": status}
        if chunk_count is not None:
            payload["chunkCount"] = str(chunk_count)

        async with httpx.AsyncClient(timeout=10) as client:
            await client.patch(
                f"{settings.api_url}/internal/files/{file_id}/status",
                json=payload,
                headers={"x-internal-secret": settings.internal_secret},
            )
    except Exception:
        pass  # status update failure is non-fatal


# ── POST /ai/rag/index ────────────────────────────────────────────────────────

@router.post("/rag/index")
async def index_document(request: IndexRequest, background_tasks: BackgroundTasks):
    """
    Trigger file indexing pipeline asynchronously.
    Returns immediately; indexing runs in background.
    """
    background_tasks.add_task(
        _run_indexing,
        request.file_id,
        request.s3_key,
        request.workspace_id,
    )
    return {"status": "indexing", "file_id": request.file_id}


async def _run_indexing(file_id: str, s3_key: str, workspace_id: str):
    """Background task: run full indexing pipeline and update file status."""
    # Mark as INDEXING
    await _update_file_status(file_id, "INDEXING")

    try:
        chunk_count = await index_file(file_id, s3_key, workspace_id)
        await _update_file_status(file_id, "INDEXED", chunk_count)
    except Exception as e:
        await _update_file_status(file_id, "FAILED")
        raise e


# ── POST /ai/rag/query ────────────────────────────────────────────────────────

@router.post("/rag/query")
async def query_rag(request: QueryRequest):
    """
    Retrieve top-K relevant chunks from Pinecone for a query.
    Used by the chat flow when ragEnabled=true.
    """
    from openai import AsyncOpenAI
    from app.services.pinecone_client import get_pinecone_index

    if not settings.openai_api_key:
        raise HTTPException(status_code=503, detail="OpenAI API key not configured")

    # Generate query embedding
    client = AsyncOpenAI(api_key=settings.openai_api_key)
    embedding_response = await client.embeddings.create(
        input=request.query,
        model="text-embedding-3-small",
    )
    query_vector = embedding_response.data[0].embedding

    # Search Pinecone
    index = get_pinecone_index()
    results = index.query(
        vector=query_vector,
        top_k=request.top_k,
        namespace=request.workspace_id,
        include_metadata=True,
    )

    chunks = [
        {
            "text": match.metadata.get("text", "") if match.metadata else "",
            "score": match.score,
            "file_id": match.metadata.get("file_id", "") if match.metadata else "",
            "chunk_index": match.metadata.get("chunk_index", 0) if match.metadata else 0,
        }
        for match in results.matches
    ]

    return {"chunks": chunks, "query": request.query}


# ── DELETE /ai/rag/documents/{document_id} ────────────────────────────────────

@router.delete("/rag/documents/{document_id}")
async def delete_document(document_id: str, workspace_id: str = ""):
    """Remove all vector embeddings for a file."""
    if not workspace_id:
        raise HTTPException(status_code=400, detail="workspace_id query param required")

    await delete_file_vectors(document_id, workspace_id)
    return {"deleted": document_id, "workspace_id": workspace_id}
