import { MockLanguageModelV3 } from "ai/test";
import { describe, expect, it } from "vitest";
import { AVAILABLE_MODELS } from "./models";
import { resolveWebSearchTools, withWebSearchFallback } from "./web-search";

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
	it.each(
		cases,
	)("exposes the provider's search tool for %s", (modelId, keys) => {
		expect(Object.keys(resolveWebSearchTools(modelId))).toEqual(keys);
	});
});

describe("withWebSearchFallback", () => {
	const callOptions = {
		prompt: [],
		tools: [
			{ type: "function" as const, name: "plan", inputSchema: {} },
			{
				type: "provider" as const,
				id: "anthropic.web_search_20250305",
				name: "web_search",
				args: {},
			},
		],
	};

	it("retries without provider tools when the search tool is rejected", async () => {
		const seen: string[][] = [];
		const model = new MockLanguageModelV3({
			doStream: async (options) => {
				seen.push((options.tools ?? []).map((tool) => tool.name));
				if (seen.length === 1)
					throw new Error("web_search tool is not supported");
				return { stream: new ReadableStream() };
			},
		});

		await (withWebSearchFallback(model) as MockLanguageModelV3).doStream(
			callOptions as never,
		);

		expect(seen).toEqual([["plan", "web_search"], ["plan"]]);
	});

	it("rethrows errors unrelated to the search tool", async () => {
		const model = new MockLanguageModelV3({
			doStream: async () => {
				throw new Error("rate limited");
			},
		});

		await expect(
			(withWebSearchFallback(model) as MockLanguageModelV3).doStream(
				callOptions as never,
			),
		).rejects.toThrow("rate limited");
	});
});
