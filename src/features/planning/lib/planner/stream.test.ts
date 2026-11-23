import { simulateReadableStream, type UIMessage } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { describe, expect, it } from "vitest";
import { createPlannerResponse } from "./stream";

const history: UIMessage[] = [
	{ id: "user-1", role: "user", parts: [{ type: "text", text: "oi" }] },
];

const usage = {
	inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
	outputTokens: { total: 1, text: 1, reasoning: undefined },
};

const model = () =>
	new MockLanguageModelV3({
		doStream: async () => ({
			stream: simulateReadableStream({
				chunks: [
					{ type: "text-start", id: "text-1" },
					{ type: "text-delta", id: "text-1", delta: "Ol" },
					{ type: "text-delta", id: "text-1", delta: "á" },
					{ type: "text-end", id: "text-1" },
					{
						type: "finish",
						finishReason: { unified: "stop", raw: undefined },
						logprobs: undefined,
						usage,
					},
				],
			}),
		}),
	});

describe("streaming do planejador", () => {
	it("persiste a resposta do assistente ao terminar o stream", async () => {
		let finish: (messages: UIMessage[]) => void = () => {};
		const finished = new Promise<UIMessage[]>((resolve) => {
			finish = resolve;
		});
		const response = await createPlannerResponse({
			model: model(),
			system: "",
			history,
			tools: {},
			onFinish: async (messages) => finish(messages),
		});

		await response.text();
		const messages = await finished;

		expect(messages).toHaveLength(2);
		const assistant = messages[1];
		expect(assistant.role).toBe("assistant");
		const text = assistant.parts
			.filter((part) => part.type === "text")
			.map((part) => part.text)
			.join("");
		expect(text).toBe("Olá");
	});

	it("persiste a resposta mesmo quando o cliente desconecta no meio do stream", async () => {
		let finish: (messages: UIMessage[]) => void = () => {};
		const finished = new Promise<UIMessage[]>((resolve) => {
			finish = resolve;
		});
		const response = await createPlannerResponse({
			model: model(),
			system: "",
			history,
			tools: {},
			onFinish: async (messages) => finish(messages),
		});

		const reader = response.body!.getReader();
		await reader.read();
		await reader.cancel();

		await expect(finished).resolves.toHaveLength(2);
	});
});
