import { describe, expect, it, vi } from "vitest";
import { AiReconnectRequiredError } from "../credentials/errors";
import { listChatGptModels } from "./models-list";

const jsonResponse = (status: number, body: unknown) =>
	new Response(JSON.stringify(body), { status });

const getAccessToken = async () => ({ accessToken: "at", accountId: "acc" });

describe("listChatGptModels", () => {
	it("maps the backend list and caches it per user for 5 minutes", async () => {
		const fetchImpl = vi.fn(async () =>
			jsonResponse(200, {
				models: [
					{ slug: "gpt-5.5", display_name: "GPT-5.5" },
					{ slug: "gpt-5.4-mini" },
				],
			}),
		) as unknown as typeof fetch;
		let clock = 1_000_000;
		const deps = { fetch: fetchImpl, getAccessToken, now: () => clock };

		const models = await listChatGptModels("cache-u1", deps);
		await listChatGptModels("cache-u1", deps);

		expect(models.map((model) => model.id)).toEqual([
			"chatgpt:gpt-5.5",
			"chatgpt:gpt-5.4-mini",
		]);
		expect(models.map((model) => model.name)).toEqual([
			"GPT-5.5",
			"gpt-5.4-mini",
		]);
		expect(fetchImpl).toHaveBeenCalledTimes(1);

		await listChatGptModels("cache-u2", deps);
		expect(fetchImpl).toHaveBeenCalledTimes(2);

		clock += 5 * 60 * 1000 + 1000;
		await listChatGptModels("cache-u1", deps);
		expect(fetchImpl).toHaveBeenCalledTimes(3);
	});

	it.each([
		["a 500 answer", async () => jsonResponse(500, {}), getAccessToken],
		[
			"a body without models",
			async () => jsonResponse(200, {}),
			getAccessToken,
		],
		[
			"a request that never resolves",
			() => new Promise<Response>(() => {}),
			getAccessToken,
		],
		[
			"a refused session",
			async () => jsonResponse(200, { models: [{ slug: "x" }] }),
			async () => {
				throw new AiReconnectRequiredError("chatgpt");
			},
		],
	])("falls back to the static list on %s without caching it", async (name, handler, tokenProvider) => {
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		const tokenSpy = vi.fn(tokenProvider);
		const deps = {
			fetch: handler as unknown as typeof fetch,
			getAccessToken: tokenSpy,
			timeoutMs: 10,
		};

		const first = await listChatGptModels(`fallback-${name}`, deps);
		await listChatGptModels(`fallback-${name}`, deps);

		expect(first.map((model) => model.id)).toEqual([
			"chatgpt:gpt-5.5",
			"chatgpt:gpt-5.4",
		]);
		expect(tokenSpy).toHaveBeenCalledTimes(2);
	});
});
