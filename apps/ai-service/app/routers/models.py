from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Optional

router = APIRouter()

SUPPORTED_MODELS = [
    {
        "id": "gpt-4o",
        "provider": "openai",
        "name": "GPT-4o",
        "context_window": 128000,
        "supports_streaming": True,
        "supports_function_calling": True,
    },
    {
        "id": "gpt-4o-mini",
        "provider": "openai",
        "name": "GPT-4o Mini",
        "context_window": 128000,
        "supports_streaming": True,
        "supports_function_calling": True,
    },
    {
        "id": "claude-3-5-sonnet-20241022",
        "provider": "anthropic",
        "name": "Claude 3.5 Sonnet",
        "context_window": 200000,
        "supports_streaming": True,
        "supports_function_calling": True,
    },
    {
        "id": "gemini-1.5-pro",
        "provider": "google",
        "name": "Gemini 1.5 Pro",
        "context_window": 1000000,
        "supports_streaming": True,
        "supports_function_calling": True,
    },
]


@router.get("/models")
async def list_models():
    """List all supported AI models."""
    return {"models": SUPPORTED_MODELS}


class TestModelRequest(BaseModel):
    model_id: str


@router.post("/models/test")
async def test_model(request: TestModelRequest):
    """Test model connectivity — implemented in Task 20."""
    return {"model_id": request.model_id, "status": "not_implemented"}
