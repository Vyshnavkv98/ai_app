"""
Multi-agent orchestration using LangGraph.
Supervisor routes tasks to specialist agents and assembles the final response.
"""
import asyncio
import json
from typing import Any, Dict, List, Optional, TypedDict, Annotated
from openai import AsyncOpenAI, APIError
from app.config import settings
from app.services.usage import calculate_cost

# ── State definition ──────────────────────────────────────────────────────────

class AgentState(TypedDict):
    task: str
    workspace_id: str
    classification: Optional[str]
    specialist_result: Optional[str]
    final_response: Optional[str]
    usage_logs: List[Dict[str, Any]]
    error: Optional[str]


# ── Node factories ────────────────────────────────────────────────────────────

def create_supervisor_node(supervisor_config: Dict[str, Any]):
    """
    Supervisor node: classifies the task and routes to the right specialist.
    Returns updated state with classification.
    """
    async def supervisor(state: AgentState) -> AgentState:
        client = AsyncOpenAI(api_key=settings.openai_api_key)
        model = supervisor_config.get("model", "gpt-4o")

        system_prompt = supervisor_config.get(
            "system_prompt",
            "You are a supervisor. Classify the task into one of: billing, technical, general, escalation. "
            "Respond with ONLY the classification word."
        )

        try:
            response = await client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"Classify this task: {state['task']}"},
                ],
                max_tokens=20,
                temperature=0,
            )
            classification = response.choices[0].message.content.strip().lower()
            usage = response.usage

            state["classification"] = classification
            state["usage_logs"].append({
                "agent": "supervisor",
                "model": model,
                "prompt_tokens": usage.prompt_tokens if usage else 0,
                "completion_tokens": usage.completion_tokens if usage else 0,
                "cost_usd": calculate_cost(model, usage.prompt_tokens if usage else 0, usage.completion_tokens if usage else 0),
            })
        except APIError as e:
            state["error"] = f"Supervisor failed: {str(e)}"
            state["classification"] = "general"

        return state

    return supervisor


def create_specialist_node(specialist_config: Dict[str, Any]):
    """
    Specialist node: handles the task for its domain and returns a result.
    """
    async def specialist(state: AgentState) -> AgentState:
        client = AsyncOpenAI(api_key=settings.openai_api_key)
        model = specialist_config.get("model", "gpt-4o")
        name = specialist_config.get("name", "specialist")

        system_prompt = specialist_config.get(
            "system_prompt",
            f"You are a {name} specialist. Handle the task thoroughly and professionally."
        )

        try:
            response = await client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": state["task"]},
                ],
                max_tokens=specialist_config.get("max_tokens", 2048),
                temperature=specialist_config.get("temperature", 0.7),
            )
            result = response.choices[0].message.content or ""
            usage = response.usage

            state["specialist_result"] = result
            state["usage_logs"].append({
                "agent": name,
                "model": model,
                "prompt_tokens": usage.prompt_tokens if usage else 0,
                "completion_tokens": usage.completion_tokens if usage else 0,
                "cost_usd": calculate_cost(model, usage.prompt_tokens if usage else 0, usage.completion_tokens if usage else 0),
            })
        except APIError as e:
            state["specialist_result"] = f"Specialist error: {str(e)}"
            state["error"] = str(e)

        return state

    return specialist


def create_response_writer_node():
    """
    Final node: assembles the specialist result into a polished response.
    """
    async def response_writer(state: AgentState) -> AgentState:
        state["final_response"] = state.get("specialist_result") or "I was unable to process your request."
        return state

    return response_writer


# ── Routing function ──────────────────────────────────────────────────────────

def routing_function(state: AgentState) -> str:
    """Route from supervisor to the appropriate specialist based on classification."""
    classification = state.get("classification", "general")
    routing_map = {
        "billing": "billing_specialist",
        "technical": "technical_specialist",
        "escalation": "escalation_specialist",
    }
    return routing_map.get(classification, "general_specialist")


# ── Main multi-agent executor ─────────────────────────────────────────────────

async def run_multi_agent(
    task: str,
    workspace_id: str,
    agent_configs: List[Dict[str, Any]],
    timeout_seconds: int = 300,
) -> Dict[str, Any]:
    """
    Execute a multi-agent workflow.

    agent_configs should contain:
      - One config with role="supervisor"
      - One or more configs with role="specialist" and a name

    Returns WorkflowResult dict.
    """
    if not settings.openai_api_key:
        return {
            "status": "FAILED",
            "output": None,
            "error": "OpenAI API key not configured",
            "usage_logs": [],
        }

    # Separate supervisor from specialists
    supervisor_config = next((a for a in agent_configs if a.get("role") == "supervisor"), None)
    specialist_configs = [a for a in agent_configs if a.get("role") != "supervisor"]

    if not supervisor_config:
        # Default supervisor if none provided
        supervisor_config = {"role": "supervisor", "model": "gpt-4o"}

    if not specialist_configs:
        # Default general specialist
        specialist_configs = [{"role": "specialist", "name": "general", "model": "gpt-4o"}]

    # Build state
    state: AgentState = {
        "task": task,
        "workspace_id": workspace_id,
        "classification": None,
        "specialist_result": None,
        "final_response": None,
        "usage_logs": [],
        "error": None,
    }

    try:
        # Execute with timeout
        async def _execute():
            # Step 1: Supervisor classifies
            supervisor_fn = create_supervisor_node(supervisor_config)
            state_after_supervisor = await supervisor_fn(state)

            # Step 2: Route to specialist
            route = routing_function(state_after_supervisor)
            specialist_config_to_use = next(
                (s for s in specialist_configs if s.get("name") == route.replace("_specialist", "")),
                specialist_configs[0]  # fallback to first specialist
            )

            specialist_fn = create_specialist_node(specialist_config_to_use)
            state_after_specialist = await specialist_fn(state_after_supervisor)

            # Step 3: Write final response
            writer_fn = create_response_writer_node()
            final_state = await writer_fn(state_after_specialist)
            return final_state

        final_state = await asyncio.wait_for(_execute(), timeout=timeout_seconds)

        return {
            "status": "SUCCESS" if not final_state.get("error") else "PARTIAL",
            "output": final_state.get("final_response"),
            "classification": final_state.get("classification"),
            "usage_logs": final_state.get("usage_logs", []),
            "error": final_state.get("error"),
        }

    except asyncio.TimeoutError:
        return {
            "status": "FAILED",
            "output": None,
            "error": "Execution timeout (5 minutes)",
            "usage_logs": state.get("usage_logs", []),
        }
    except Exception as e:
        return {
            "status": "FAILED",
            "output": None,
            "error": str(e),
            "usage_logs": state.get("usage_logs", []),
        }
