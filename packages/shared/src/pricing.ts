import type { AIModel } from "./types";

export interface ModelPricing {
  inputPer1kTokens: number;  // USD per 1,000 input tokens
  outputPer1kTokens: number; // USD per 1,000 output tokens
}

export const MODEL_PRICING: Record<AIModel, ModelPricing> = {
  "gpt-4o": {
    inputPer1kTokens: 0.005,
    outputPer1kTokens: 0.015,
  },
  "gpt-4o-mini": {
    inputPer1kTokens: 0.00015,
    outputPer1kTokens: 0.0006,
  },
  "claude-3-5-sonnet-20241022": {
    inputPer1kTokens: 0.003,
    outputPer1kTokens: 0.015,
  },
  "gemini-1.5-pro": {
    inputPer1kTokens: 0.00125,
    outputPer1kTokens: 0.005,
  },
};

/**
 * Calculate the cost in USD for a given model and token counts.
 */
export function calculateCost(
  model: AIModel,
  promptTokens: number,
  completionTokens: number
): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return 0;
  const inputCost = (promptTokens / 1000) * pricing.inputPer1kTokens;
  const outputCost = (completionTokens / 1000) * pricing.outputPer1kTokens;
  return inputCost + outputCost;
}
