import { describe, expect, it } from "vitest";
import { AVAILABLE_MODELS } from "./models";
import { resolveWebSearchTools } from "./web-search";

const firstModelOf = (provider: string) =>
	AVAILABLE_MODELS.find((m) => m.provider === provider)?.id ?? "";

const cases: [string, string[]][] = [
	[firstModelOf("anthropic"), ["web_search"]],
	[firstModelOf("openai"), ["web_search"]],
	[firstModelOf("google"), ["google_search"]],
	[firstModelOf("minimax"), []],
	[firstModelOf("ollama"), []],
	["meta/llama-3", []],
];

describe("resolveWebSearchTools", () => {
	it.each(cases)("exposes the provider's search tool for %s", (modelId, keys) => {
		expect(Object.keys(resolveWebSearchTools(modelId))).toEqual(keys);
	});
});
