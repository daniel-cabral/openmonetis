import { describe, expect, it } from "vitest";
import { buildModelGroups, pickAvailableModel } from "./model-groups";

const chatgptModels = [
	{ id: "chatgpt:gpt-5.5", name: "GPT-5.5", provider: "chatgpt" as const },
	{
		id: "chatgpt:gpt-5.4-mini",
		name: "GPT-5.4 Mini",
		provider: "chatgpt" as const,
	},
];

describe("model groups", () => {
	it("groups only connected providers with the subscription first", () => {
		const groups = buildModelGroups(["anthropic", "chatgpt"], chatgptModels);
		expect(groups.map((group) => group.label)).toEqual([
			"ChatGPT (assinatura)",
			"Claude AI",
		]);
		expect(groups[0].models.map((model) => model.id)).toEqual([
			"chatgpt:gpt-5.5",
			"chatgpt:gpt-5.4-mini",
		]);
		expect(buildModelGroups(["openai"], [])[0].label).toBe("OpenAI (API)");
		expect(buildModelGroups([], [])).toEqual([]);
	});

	it("falls back when the saved model's provider is gone", () => {
		expect(
			pickAvailableModel("gpt-5.5", buildModelGroups(["anthropic"], [])),
		).toBe("claude-opus-4-8");
		expect(pickAvailableModel("x", [])).toBeNull();
	});
});
