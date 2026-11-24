import type { JSONObject } from "@ai-sdk/provider";

export type AiEffort = "low" | "medium" | "high";

export const PLANNER_EFFORT: AiEffort = "high";
export const INSIGHTS_EFFORT: AiEffort = "medium";
export const PLANNER_MAX_OUTPUT_TOKENS = 16000;
export const INSIGHTS_MAX_OUTPUT_TOKENS = 8000;

// Adaptive thinking and `effort` exist from Claude 4.6 on; older ids would 400.
const ANTHROPIC_ADAPTIVE = /^claude-(?:(?:opus|sonnet)-4-[6-9]|[a-z]+-[5-9])/;
const OPENAI_REASONING = /^(?:gpt-5|o\d)/;
// thinkingLevel is a Gemini 3 option; 2.x models use token budgets instead.
const GEMINI_THINKING_LEVEL = /^gemini-(?:[3-9])/;

/**
 * Provider options for a fixed reasoning effort, keyed by provider. Unknown
 * providers (minimax, openrouter, ollama) get none. Never sets temperature,
 * budgetTokens or disabled thinking.
 */
export function buildProviderOptions(
	modelId: string,
	effort: AiEffort,
): Record<string, JSONObject> {
	const id = modelId.trim().replace(/^chatgpt:/, "");
	if (ANTHROPIC_ADAPTIVE.test(id)) {
		return { anthropic: { thinking: { type: "adaptive" }, effort } };
	}
	if (OPENAI_REASONING.test(id)) {
		return { openai: { reasoningEffort: effort } };
	}
	if (GEMINI_THINKING_LEVEL.test(id)) {
		return { google: { thinkingConfig: { thinkingLevel: effort } } };
	}
	return {};
}
