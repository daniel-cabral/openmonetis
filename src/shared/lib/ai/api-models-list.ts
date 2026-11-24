import { getProviderSecret } from "./credentials/store";
import { type AiProviderId, AVAILABLE_MODELS } from "./models";

export type ApiListedProvider = "anthropic" | "openai" | "google";
export type ListedModel = { id: string; name: string };

export const API_MODELS_TIMEOUT_MS = 3000;
export const API_MODELS_CACHE_MS = 5 * 60 * 1000;

const LISTED_PROVIDERS: ApiListedProvider[] = ["anthropic", "openai", "google"];
const OPENAI_EXCLUDED = [
	"audio",
	"realtime",
	"transcribe",
	"tts",
	"image",
	"embedding",
	"search",
	"moderation",
	"instruct",
];

export type ListApiModelsDeps = {
	fetch?: typeof fetch;
	getApiKey?: () => Promise<string | undefined>;
	now?: () => number;
	timeoutMs?: number;
};

const cache = new Map<string, { models: ListedModel[]; expiresAt: number }>();

type RequestJson = (
	url: string,
	headers: Record<string, string>,
) => Promise<unknown>;

async function listAnthropic(request: RequestJson, apiKey: string) {
	const models: ListedModel[] = [];
	let afterId: string | undefined;
	for (let page = 0; page < 10; page++) {
		const query = new URLSearchParams({ limit: "100" });
		if (afterId) query.set("after_id", afterId);
		const body = (await request(
			`https://api.anthropic.com/v1/models?${query}`,
			{ "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
		)) as {
			data?: { id?: string; display_name?: string }[];
			has_more?: boolean;
			last_id?: string;
		};
		for (const model of body.data ?? []) {
			if (model.id)
				models.push({ id: model.id, name: model.display_name ?? model.id });
		}
		if (!body.has_more || !body.last_id) break;
		afterId = body.last_id;
	}
	return models;
}

async function listOpenAi(request: RequestJson, apiKey: string) {
	const body = (await request("https://api.openai.com/v1/models", {
		authorization: `Bearer ${apiKey}`,
	})) as { data?: { id?: string; created?: number }[] };
	return (body.data ?? [])
		.filter(
			(model): model is { id: string; created?: number } =>
				!!model.id &&
				(model.id.startsWith("gpt-") || /^o\d/.test(model.id)) &&
				!OPENAI_EXCLUDED.some((word) => model.id?.includes(word)),
		)
		.sort((a, b) => (b.created ?? 0) - (a.created ?? 0))
		.map((model) => ({ id: model.id, name: model.id }));
}

async function listGoogle(request: RequestJson, apiKey: string) {
	const body = (await request(
		"https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000",
		{ "x-goog-api-key": apiKey },
	)) as {
		models?: {
			name?: string;
			displayName?: string;
			supportedGenerationMethods?: string[];
		}[];
	};
	return (body.models ?? []).flatMap((model) =>
		model.name?.startsWith("models/gemini") &&
		model.supportedGenerationMethods?.includes("generateContent")
			? [
					{
						id: model.name.slice("models/".length),
						name: model.displayName ?? model.name.slice("models/".length),
					},
				]
			: [],
	);
}

async function fetchModels(
	provider: ApiListedProvider,
	deps: ListApiModelsDeps,
	userId: string,
	timeoutMs: number,
): Promise<ListedModel[]> {
	const apiKey = await (
		deps.getApiKey ??
		(async () => (await getProviderSecret(userId, provider)).apiKey)
	)();
	if (!apiKey) throw new Error("Missing API key");
	const controller = new AbortController();
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => {
			controller.abort();
			reject(new Error(`${provider} models request timed out`));
		}, timeoutMs);
	});
	const request: RequestJson = async (url, headers) => {
		const response = await (deps.fetch ?? fetch)(url, {
			signal: controller.signal,
			headers,
		});
		if (!response.ok) {
			throw new Error(`${provider} models request failed (${response.status})`);
		}
		return response.json();
	};
	try {
		const list =
			provider === "anthropic"
				? listAnthropic(request, apiKey)
				: provider === "openai"
					? listOpenAi(request, apiKey)
					: listGoogle(request, apiKey);
		return await Promise.race([list, timeout]);
	} finally {
		clearTimeout(timer);
	}
}

function fallbackModels(provider: ApiListedProvider): ListedModel[] {
	return AVAILABLE_MODELS.filter((model) => model.provider === provider).map(
		({ id, name }) => ({ id, name }),
	);
}

// Never throws: any failure falls back to the static list and is not cached.
export async function listApiProviderModels(
	userId: string,
	provider: ApiListedProvider,
	deps: ListApiModelsDeps = {},
): Promise<ListedModel[]> {
	const key = `${userId}:${provider}`;
	const now = (deps.now ?? Date.now)();
	const cached = cache.get(key);
	if (cached && cached.expiresAt > now) return cached.models;
	try {
		const models = await fetchModels(
			provider,
			deps,
			userId,
			deps.timeoutMs ?? API_MODELS_TIMEOUT_MS,
		);
		if (models.length === 0) return fallbackModels(provider);
		cache.set(key, { models, expiresAt: now + API_MODELS_CACHE_MS });
		return models;
	} catch (error) {
		console.error(`Failed to list ${provider} models`, error);
		return fallbackModels(provider);
	}
}

export async function listConnectedApiModels(
	userId: string,
	connected: AiProviderId[],
): Promise<Partial<Record<AiProviderId, ListedModel[]>>> {
	const providers = LISTED_PROVIDERS.filter((provider) =>
		connected.includes(provider),
	);
	const lists = await Promise.all(
		providers.map((provider) => listApiProviderModels(userId, provider)),
	);
	return Object.fromEntries(
		providers.map((provider, i) => [provider, lists[i]]),
	);
}
