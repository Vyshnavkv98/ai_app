from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Optional

router = APIRouter()


class MemoryTurn(BaseModel):
    role: str
    content: str


class UpdateMemoryRequest(BaseModel):
    turns: List[MemoryTurn]


@router.get("/memory/{session_id}")
async def get_memory(session_id: str):
    """Get session memory — implemented in Task 17."""
    return {"session_id": session_id, "turns": []}


@router.post("/memory/{session_id}")
async def update_memory(session_id: str, request: UpdateMemoryRequest):
    """Update session memory — implemented in Task 17."""
    return {"session_id": session_id, "updated": True}


@router.delete("/memory/{session_id}")
async def clear_memory(session_id: str):
    """Clear session memory — implemented in Task 17."""
    return {"session_id": session_id, "cleared": True}
