from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List, Any

router = APIRouter()


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    model: str = "gpt-4o"
    max_tokens: int = 4096
    temperature: float = 0.7
    session_id: Optional[str] = None
    agent_config: Optional[dict] = None
    workspace_id: Optional[str] = None


class ChatResponse(BaseModel):
    content: str
    model: str
    usage: Optional[dict] = None


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """Single-turn chat — implemented in Task 7."""
    return ChatResponse(
        content="Chat endpoint not yet implemented.",
        model=request.model,
    )


@router.post("/chat/stream")
async def chat_stream(request: ChatRequest):
    """SSE streaming chat — implemented in Task 7."""

    async def generate():
        yield "data: {\"content\": \"Streaming not yet implemented.\"}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
