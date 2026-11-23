import { readFileSync } from "node:fs";
import { join } from "node:path";
import { generateObject, generateText } from "ai";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AiReconnectRequiredError } from "../credentials/errors";
import { createChatGptModel } from "./model";

const fixture = (name: string) =>
	readFileSync(join(__dirname, "fixtures", name), "utf8");

const sseResponse = (body: string) =>
	new Response(body, {
		status: 200,
		headers: { "content-type": "text/event-stream" },
	});

const getAccessToken = async () => ({ accessToken: "at", accountId: "acc" });

describe("chatgpt language model", () => {
	it("generateText goes through the streaming endpoint with subscription headers and store false", async () => {
		const captured: {
			url?: string;
			headers?: Headers;
			body?: Record<string, unknown>;
		} = {};
		const fetchImpl = (async (url: string, init?: RequestInit) => {
			captured.url = String(url);
			captured.headers = new Headers(init?.headers);
			captured.body = JSON.parse(init?.body as string);
			return sseResponse(fixture("responses-text.sse"));
		}) as typeof fetch;
		const model = createChatGptModel("u1", "gpt-5.5", {
			fetch: fetchImpl,
			getAccessToken,
		});

		const result = await generateText({
			model,
			system: "Be terse.",
			prompt: "hi",
		});

		expect(result.text).toBe("Hello, hope you're doing well.");
		expect(captured.url).toMatch(/\/responses$/);
		expect(captured.headers?.get("authorization")).toBe("Bearer at");
		expect(captured.headers?.get("chatgpt-account-id")).toBe("acc");
		expect(captured.headers?.get("originator")).toBe("openmonetis");
		expect(captured.body).toMatchObject({
			stream: true,
			store: false,
			instructions: "Be terse.",
		});
	});

	it("generateObject works through the streaming endpoint", async () => {
		const bodies: Record<string, unknown>[] = [];
		const fetchImpl = (async (_url: string, init?: RequestInit) => {
			bodies.push(JSON.parse(init?.body as string));
			return sseResponse(fixture("responses-json.sse"));
		}) as typeof fetch;
		const model = createChatGptModel("u1", "gpt-5.5", {
			fetch: fetchImpl,
			getAccessToken,
		});

		const result = await generateObject({
			model,
			schema: z.object({ ok: z.boolean() }),
			prompt: "x",
		});

		expect(result.object).toEqual({ ok: true });
		expect(bodies[0].stream).toBe(true);
	});

	it("a 401 marks the session expired", async () => {
		const markNeedsReconnect = vi.fn(async () => undefined);
		const fetchImpl = (async () =>
			new Response(JSON.stringify({ error: { code: "token_expired" } }), {
				status: 401,
			})) as typeof fetch;
		const model = createChatGptModel("u1", "gpt-5.5", {
			fetch: fetchImpl,
			getAccessToken,
			markNeedsReconnect,
		});

		await expect(
			generateText({ model, prompt: "hi", maxRetries: 0 }),
		).rejects.toSatisfy(
			(error) =>
				error instanceof AiReconnectRequiredError ||
				(error as Error).cause instanceof AiReconnectRequiredError,
		);
		expect(markNeedsReconnect).toHaveBeenCalledWith("u1");
	});
});
