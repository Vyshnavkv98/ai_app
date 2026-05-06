import json
import asyncio
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List
from openai import AsyncOpenAI, APIError, RateLimitError, APIConnectionError

from app.config import settings
from app.services.memory import MemoryService
from app.services.usage import calculate_cost
from app.services.rag import retrieve_context

router = APIRouter()
memory_service = MemoryService()


# ── Request / Response models ────────────────────────────────────────────────

class ChatMessageModel(BaseModel):
    role: str
    content: str


class AgentConfigModel(BaseModel):
    id: Optional[str] = None
    name: Optional[str] = "Assistant"
    system_prompt: Optional[str] = "You are a helpful AI assistant."
    model: Optional[str] = "gpt-4o"
    max_tokens: Optional[int] = 4096
    temperature: Optional[float] = 0.7
    memory_enabled: Optional[bool] = True
    rag_enabled: Optional[bool] = False


class StreamChatRequest(BaseModel):
    message: str
    session_id: str
    workspace_id: str
    agent_config: Optional[AgentConfigModel] = None
    memory: Optional[List[ChatMessageModel]] = None


class ChatRequest(BaseModel):
    messages: List[ChatMessageModel]
    model: str = "gpt-4o"
    max_tokens: int = 4096
    temperature: float = 0.7
    session_id: Optional[str] = None
    agent_config: Optional[AgentConfigModel] = None
    workspace_id: Optional[str] = None


class UsageInfo(BaseModel):
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    cost_usd: float
    model: str


class ChatResponse(BaseModel):
    content: str
    model: str
    usage: Optional[UsageInfo] = None


# ── Helpers ──────────────────────────────────────────────────────────────────

def _build_messages(
    user_message: str,
    system_prompt: str,
    memory: List[ChatMessageModel],
) -> list:
    """Build the messages array: system + memory history + new user message."""
    msgs = [{"role": "system", "content": system_prompt}]
    for m in memory[-20:]:  # sliding window — max 20 turns
        msgs.append({"role": m.role, "content": m.content})
    msgs.append({"role": "user", "content": user_message})
    return msgs


def _get_client() -> AsyncOpenAI:
    if not settings.openai_api_key:
        raise HTTPException(status_code=503, detail="OpenAI API key not configured")
    return AsyncOpenAI(api_key=settings.openai_api_key)


# ── POST /ai/chat/stream ─────────────────────────────────────────────────────

@router.post("/chat/stream")
async def chat_stream(request: StreamChatRequest):
    """
    SSE streaming chat endpoint.
    Streams tokens as: data: {"token": "..."}\n\n
    Ends with:         data: {"done": true, "usage": {...}}\n\n
    """
    agent = request.agent_config or AgentConfigModel()
    model = agent.model or "gpt-4o"

    # Load short-term memory from Redis if not provided inline
    memory = request.memory or []
    if not memory and agent.memory_enabled:
        memory = await memory_service.get(request.session_id)

    # RAG: retrieve relevant chunks and inject into system prompt
    system_prompt = agent.system_prompt or "You are a helpful AI assistant."
    if agent.rag_enabled and request.workspace_id:
        rag_context = await retrieve_context(
            query=request.message,
            workspace_id=request.workspace_id,
            top_k=5,
        )
        if rag_context:
            system_prompt = (
                f"{system_prompt}\n\n"
                "Use the following context from the knowledge base to answer the user's question. "
                "If the context doesn't contain the answer, say so and answer from your general knowledge.\n\n"
                "--- KNOWLEDGE BASE CONTEXT ---\n"
                f"{rag_context}\n"
                "--- END CONTEXT ---"
            )

    messages = _build_messages(request.message, system_prompt, memory)
    client = _get_client()

    async def generate():
        full_response = ""
        prompt_tokens = 0
        completion_tokens = 0

        try:
            stream = await client.chat.completions.create(
                model=model,
                messages=messages,
                max_tokens=agent.max_tokens or 4096,
                temperature=agent.temperature or 0.7,
                stream=True,
                stream_options={"include_usage": True},
            )

            async for chunk in stream:
                # Token delta
                delta = chunk.choices[0].delta if chunk.choices else None
                if delta and delta.content:
                    full_response += delta.content
                    yield f"data: {json.dumps({'token': delta.content})}\n\n"

                # Usage comes in the final chunk
                if chunk.usage:
                    prompt_tokens = chunk.usage.prompt_tokens
                    completion_tokens = chunk.usage.completion_tokens

        except RateLimitError:
            yield f"data: {json.dumps({'error': 'Rate limit exceeded. Please try again.'})}\n\n"
            return
        except APIConnectionError:
            yield f"data: {json.dumps({'error': 'AI service connection failed.'})}\n\n"
            return
        except APIError as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            return

        # Update short-term memory
        if agent.memory_enabled:
            await memory_service.append(
                request.session_id,
                [
                    {"role": "user", "content": request.message},
                    {"role": "assistant", "content": full_response},
                ],
            )

        # Final done event with usage
        total_tokens = prompt_tokens + completion_tokens
        cost = calculate_cost(model, prompt_tokens, completion_tokens)

        yield f"data: {json.dumps({'done': True, 'usage': {'prompt_tokens': prompt_tokens, 'completion_tokens': completion_tokens, 'total_tokens': total_tokens, 'cost_usd': cost, 'model': model}})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


# ── POST /ai/chat ────────────────────────────────────────────────────────────

@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """Non-streaming single-turn chat."""
    client = _get_client()
    model = request.model

    messages = [{"role": m.role, "content": m.content} for m in request.messages]

    try:
        response = await client.chat.completions.create(
            model=model,
            messages=messages,
            max_tokens=request.max_tokens,
            temperature=request.temperature,
        )
    except APIError as e:
        raise HTTPException(status_code=502, detail=str(e))

    content = response.choices[0].message.content or ""
    usage = response.usage

    cost = calculate_cost(
        model,
        usage.prompt_tokens if usage else 0,
        usage.completion_tokens if usage else 0,
    )

    return ChatResponse(
        content=content,
        model=model,
        usage=UsageInfo(
            prompt_tokens=usage.prompt_tokens if usage else 0,
            completion_tokens=usage.completion_tokens if usage else 0,
            total_tokens=usage.total_tokens if usage else 0,
            cost_usd=cost,
            model=model,
        ),
    )
