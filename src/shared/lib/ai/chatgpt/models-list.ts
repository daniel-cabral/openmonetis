import { CHATGPT_FALLBACK_MODELS, type ChatGptModel } from "../models";
import {
	CHATGPT_API_BASE,
	CHATGPT_MODELS_CACHE_MS,
	CHATGPT_MODELS_TIMEOUT_MS,
	CHATGPT_ORIGINATOR,
} from "./constants";
import { type ChatGptAccessToken, getChatGptAccessToken } from "./credentials";

export type ListChatGptModelsDeps = {
	fetch?: typeof fetch;
	getAccessToken?: () => Promise<ChatGptAccessToken>;
	now?: () => number;
	timeoutMs?: number;
};

const cache = new Map<string, { models: ChatGptModel[]; expiresAt: number }>();

async function fetchModels(
	deps: ListChatGptModelsDeps,
	userId: string,
	timeoutMs: number,
): Promise<ChatGptModel[]> {
	const { accessToken, accountId } = await (
		deps.getAccessToken ?? (() => getChatGptAccessToken(userId))
	)();
	const controller = new AbortController();
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => {
			controller.abort();
			reject(new Error("ChatGPT models request timed out"));
		}, timeoutMs);
	});
	try {
		const request = (async () => {
			const response = await (deps.fetch ?? fetch)(
				`${CHATGPT_API_BASE}/models?client_version=0.0.0`,
				{
					signal: controller.signal,
					headers: {
						"content-type": "application/json",
						authorization: `Bearer ${accessToken}`,
						"chatgpt-account-id": accountId,
						originator: CHATGPT_ORIGINATOR,
					},
				},
			);
			if (!response.ok) {
				throw new Error(`ChatGPT models request failed (${response.status})`);
			}
			const body = (await response.json()) as {
				models?: { slug?: string; display_name?: string }[];
			};
			return (body.models ?? []).flatMap((model) =>
				model.slug
					? [
							{
								id: `chatgpt:${model.slug}`,
								name: model.display_name ?? model.slug,
								provider: "chatgpt" as const,
							},
						]
					: [],
			);
		})();
		return await Promise.race([request, timeout]);
	} finally {
		clearTimeout(timer);
	}
}

// Never throws: any failure falls back to the static list and is not cached.
export async function listChatGptModels(
	userId: string,
	deps: ListChatGptModelsDeps = {},
): Promise<ChatGptModel[]> {
	const now = (deps.now ?? Date.now)();
	const cached = cache.get(userId);
	if (cached && cached.expiresAt > now) {
		return cached.models;
	}
	try {
		const models = await fetchModels(
			deps,
			userId,
			deps.timeoutMs ?? CHATGPT_MODELS_TIMEOUT_MS,
		);
		if (models.length === 0) {
			return CHATGPT_FALLBACK_MODELS;
		}
		cache.set(userId, { models, expiresAt: now + CHATGPT_MODELS_CACHE_MS });
		return models;
	} catch (error) {
		console.error("Failed to list ChatGPT models", error);
		return CHATGPT_FALLBACK_MODELS;
	}
}
