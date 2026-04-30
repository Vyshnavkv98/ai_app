"""
Token cost calculation — mirrors packages/shared/src/pricing.ts.
"""

MODEL_PRICING: dict[str, dict[str, float]] = {
    "gpt-4o":                    {"input": 0.005,   "output": 0.015},
    "gpt-4o-mini":               {"input": 0.00015, "output": 0.0006},
    "claude-3-5-sonnet-20241022":{"input": 0.003,   "output": 0.015},
    "gemini-1.5-pro":            {"input": 0.00125, "output": 0.005},
}


def calculate_cost(model: str, prompt_tokens: int, completion_tokens: int) -> float:
    """Return USD cost for a given model and token counts. Always >= 0."""
    pricing = MODEL_PRICING.get(model, {"input": 0.005, "output": 0.015})
    cost = (prompt_tokens / 1000) * pricing["input"] + \
           (completion_tokens / 1000) * pricing["output"]
    return max(0.0, cost)
