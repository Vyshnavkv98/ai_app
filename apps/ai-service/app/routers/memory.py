from fastapi import APIRouter
from pydantic import BaseModel
from typing import List
from app.services.memory import MemoryService

router = APIRouter()
memory_service = MemoryService()


class MemoryMessage(BaseModel):
    role: str
    content: str


class UpdateMemoryRequest(BaseModel):
    messages: List[MemoryMessage]


@router.get("/memory/{session_id}")
async def get_memory(session_id: str):
    messages = await memory_service.get(session_id)
    return {"session_id": session_id, "messages": messages}


@router.post("/memory/{session_id}")
async def update_memory(session_id: str, request: UpdateMemoryRequest):
    await memory_service.append(
        session_id,
        [m.model_dump() for m in request.messages],
    )
    return {"session_id": session_id, "updated": True}


@router.delete("/memory/{session_id}")
async def clear_memory(session_id: str):
    await memory_service.clear(session_id)
    return {"session_id": session_id, "cleared": True}
