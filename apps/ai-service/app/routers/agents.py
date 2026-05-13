from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from openai import AsyncOpenAI, APIError

from app.config import settings
from app.services.usage import calculate_cost
from app.services.rag import retrieve_context
from app.services.multi_agent import run_multi_agent

router = APIRouter()


class AgentConfigModel(BaseModel):
    id: Optional[str] = None
    name: Optional[str] = "Assistant"
    system_prompt: Optional[str] = "You are a helpful AI assistant."
    model: Optional[str] = "gpt-4o"
    max_tokens: Optional[int] = 4096
    temperature: Optional[float] = 0.7
    memory_enabled: Optional[bool] = False
    rag_enabled: Optional[bool] = False


class InvokeAgentRequest(BaseModel):
    message: str
    session_id: str
    workspace_id: str
    agent_config: Optional[AgentConfigModel] = None


class InvokeAgentResponse(BaseModel):
    response: str
    model: str
    tool_calls: List[dict] = []
    usage: dict


@router.post("/agents/invoke", response_model=InvokeAgentResponse)
async def invoke_agent(request: InvokeAgentRequest):
    """Single-turn agent invocation (non-streaming). Used for testing agents."""
    if not settings.openai_api_key:
        raise HTTPException(status_code=503, detail="OpenAI API key not configured")

    agent = request.agent_config or AgentConfigModel()
    model = agent.model or "gpt-4o"

    # Build system prompt with optional RAG context
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
                "Use the following context from the knowledge base:\n\n"
                "--- KNOWLEDGE BASE CONTEXT ---\n"
                f"{rag_context}\n"
                "--- END CONTEXT ---"
            )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": request.message},
    ]

    client = AsyncOpenAI(api_key=settings.openai_api_key)

    try:
        response = await client.chat.completions.create(
            model=model,
            messages=messages,
            max_tokens=agent.max_tokens or 4096,
            temperature=agent.temperature or 0.7,
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

    return InvokeAgentResponse(
        response=content,
        model=model,
        tool_calls=[],
        usage={
            "prompt_tokens": usage.prompt_tokens if usage else 0,
            "completion_tokens": usage.completion_tokens if usage else 0,
            "total_tokens": usage.total_tokens if usage else 0,
            "cost_usd": cost,
            "model": model,
        },
    )


class MultiAgentRequest(BaseModel):
    task: str
    workspace_id: str
    agent_configs: List[dict] = []
    timeout_seconds: int = 300


@router.post("/agents/multi")
async def invoke_multi_agent(request: MultiAgentRequest):
    """Multi-agent workflow with LangGraph supervisor + specialist pattern."""
    result = await run_multi_agent(
        task=request.task,
        workspace_id=request.workspace_id,
        agent_configs=request.agent_configs,
        timeout_seconds=request.timeout_seconds,
    )
    return result
