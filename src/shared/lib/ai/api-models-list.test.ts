import { describe, expect, it, vi } from "vitest";
import { listApiProviderModels } from "./api-models-list";

const jsonResponse = (status: number, body: unknown) =>
	new Response(JSON.stringify(body), { status });
const getApiKey = async () => "key";

describe("listApiProviderModels", () => {
	it.each([
		[
			"anthropic",
			[
				{
					data: [{ id: "claude-a", display_name: "Claude A" }],
					has_more: true,
					last_id: "claude-a",
				},
				{ data: [{ id: "claude-b" }], has_more: false },
			],
			[
				{ id: "claude-a", name: "Claude A" },
				{ id: "claude-b", name: "claude-b" },
			],
		],
		[
			"openai",
			[
				{
					data: [
						{ id: "gpt-old", created: 1 },
						{ id: "gpt-4o-audio-preview", created: 9 },
						{ id: "text-embedding-3-small", created: 9 },
						{ id: "o3-mini", created: 5 },
						{ id: "gpt-5.5", created: 8 },
						{ id: "whisper-1", created: 9 },
					],
				},
			],
			[
				{ id: "gpt-5.5", name: "gpt-5.5" },
				{ id: "o3-mini", name: "o3-mini" },
				{ id: "gpt-old", name: "gpt-old" },
			],
		],
		[
			"google",
			[
				{
					models: [
						{
							name: "models/gemini-x",
							displayName: "Gemini X",
							supportedGenerationMethods: ["generateContent"],
						},
						{
							name: "models/gemini-embed",
							supportedGenerationMethods: ["embedContent"],
						},
						{
							name: "models/imagen-3",
							supportedGenerationMethods: ["generateContent"],
						},
					],
				},
			],
			[{ id: "gemini-x", name: "Gemini X" }],
		],
	] as const)("maps the %s list", async (provider, pages, expected) => {
		const queue = [...pages];
		const fetchImpl = vi.fn(async () =>
			jsonResponse(200, queue.shift()),
		) as unknown as typeof fetch;

		const models = await listApiProviderModels(`map-${provider}`, provider, {
			fetch: fetchImpl,
			getApiKey,
		});

		expect(models).toEqual(expected);
	});

	it("caches per user and provider for 5 minutes", async () => {
		const fetchImpl = vi.fn(async () =>
			jsonResponse(200, { data: [{ id: "claude-a" }] }),
		) as unknown as typeof fetch;
		let clock = 1_000_000;
		const deps = { fetch: fetchImpl, getApiKey, now: () => clock };

		await listApiProviderModels("cache-u1", "anthropic", deps);
		await listApiProviderModels("cache-u1", "anthropic", deps);
		expect(fetchImpl).toHaveBeenCalledTimes(1);

		await listApiProviderModels("cache-u2", "anthropic", deps);
		expect(fetchImpl).toHaveBeenCalledTimes(2);

		clock += 5 * 60 * 1000 + 1000;
		await listApiProviderModels("cache-u1", "anthropic", deps);
		expect(fetchImpl).toHaveBeenCalledTimes(3);
	});

	it.each([
		["a 500 answer", async () => jsonResponse(500, {})],
		["an empty list", async () => jsonResponse(200, {})],
		["a request that never resolves", () => new Promise<Response>(() => {})],
	])("falls back to the static list on %s without caching it", async (name, handler) => {
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		const fetchImpl = vi.fn(handler) as unknown as typeof fetch;
		const deps = { fetch: fetchImpl, getApiKey, timeoutMs: 10 };

		const first = await listApiProviderModels(`fb-${name}`, "anthropic", deps);
		await listApiProviderModels(`fb-${name}`, "anthropic", deps);

		expect(first.map((model) => model.id)).toEqual([
			"claude-fable-5-2",
			"claude-opus-5-5",
			"claude-sonnet-5-5",
			"claude-haiku-5-5",
		]);
		expect(fetchImpl).toHaveBeenCalledTimes(2);
	});
});
