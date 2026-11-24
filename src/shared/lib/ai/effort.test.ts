import { describe, expect, it } from "vitest";
import { buildProviderOptions } from "./effort";

describe("buildProviderOptions", () => {
	it.each([
		[
			"claude-opus-4-8",
			{
				anthropic: {
					thinking: { type: "adaptive" },
					effort: "high",
					structuredOutputMode: "outputFormat",
				},
			},
		],
		["gpt-5.5", { openai: { reasoningEffort: "high" } }],
		["chatgpt:gpt-5.5", { openai: { reasoningEffort: "high" } }],
		["gemini-3-pro", { google: { thinkingConfig: { thinkingLevel: "high" } } }],
		["claude-haiku-4-5", {}],
		["ollama:llama3", {}],
		["openrouter:anthropic/claude-opus-4-8", {}],
	])("maps %s", (modelId, expected) => {
		expect(buildProviderOptions(modelId, "high")).toEqual(expected);
	});

	it("never sends sampling or budget fields for claude", () => {
		const json = JSON.stringify(
			buildProviderOptions("claude-opus-4-8", "medium"),
		);
		expect(json).not.toMatch(/temperature|topP|topK|budgetTokens|disabled/);
	});
});
