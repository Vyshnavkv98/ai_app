from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional, List

router = APIRouter()


class AgentInvokeRequest(BaseModel):
    agent_config: dict
    input: str
    session_id: Optional[str] = None
    workspace_id: Optional[str] = None


class MultiAgentRequest(BaseModel):
    task: dict
    workspace_id: str
    agent_configs: List[dict]


@router.post("/agents/invoke")
async def invoke_agent(request: AgentInvokeRequest):
    """Invoke LangGraph agent — implemented in Task 16."""
    return {"status": "not_implemented", "output": None}


@router.post("/agents/multi")
async def multi_agent(request: MultiAgentRequest):
    """Multi-agent workflow — implemented in Task 16."""
    return {"status": "not_implemented", "output": None}
