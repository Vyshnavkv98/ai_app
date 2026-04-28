from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

router = APIRouter()


class IndexRequest(BaseModel):
    file_id: str
    s3_key: str
    workspace_id: str


class QueryRequest(BaseModel):
    query: str
    workspace_id: str
    top_k: int = 5
    session_id: Optional[str] = None


@router.post("/rag/index")
async def index_document(request: IndexRequest):
    """Index document into vector DB — implemented in Task 9."""
    return {"status": "queued", "file_id": request.file_id}


@router.post("/rag/query")
async def query_rag(request: QueryRequest):
    """RAG query — implemented in Task 10."""
    return {"chunks": [], "answer": "RAG not yet implemented."}


@router.delete("/rag/documents/{document_id}")
async def delete_document(document_id: str):
    """Remove document embeddings — implemented in Task 9."""
    return {"deleted": document_id}
