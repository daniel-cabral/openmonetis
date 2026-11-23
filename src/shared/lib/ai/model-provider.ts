import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";
import { createMinimax } from "vercel-minimax-ai-provider";
import { createChatGptModel } from "./chatgpt/model";
import {
	AiCredentialInvalidError,
	AiCredentialMissingError,
	AiReconnectRequiredError,
} from "./credentials/errors";
import { getProviderSecret } from "./credentials/store";
import { type AiProviderId, AVAILABLE_MODELS } from "./models";

const OPENROUTER_MODEL_REGEX = /^[a-zA-Z0-9_-]+\/[a-zA-Z0-9._:-]+$/;

export type ResolveLanguageModelResult =
	| { success: true; model: LanguageModel }
	| { success: false; error: string };

type ResolveDependencies = {
	getSecret?: typeof getProviderSecret;
	createChatGptModel?: typeof createChatGptModel;
};

function stripProviderPrefix(
	modelId: string,
	provider: "openrouter" | "ollama" | "chatgpt",
) {
	return modelId.startsWith(`${provider}:`)
		? modelId.slice(`${provider}:`.length).trim()
		: modelId.trim();
}

export async function resolveLanguageModel(
	userId: string,
	modelId: string,
	deps: ResolveDependencies = {},
): Promise<ResolveLanguageModelResult> {
	const getSecret = deps.getSecret ?? getProviderSecret;
	const buildChatGptModel = deps.createChatGptModel ?? createChatGptModel;
	const normalizedModelId = modelId.trim();
	const selectedModel = AVAILABLE_MODELS.find(
		(m) => m.id === normalizedModelId,
	);
	const isChatGptModel = normalizedModelId.startsWith("chatgpt:");
	const isOpenRouterModel =
		normalizedModelId.startsWith("openrouter:") ||
		(!selectedModel &&
			!isChatGptModel &&
			OPENROUTER_MODEL_REGEX.test(normalizedModelId));
	const isOllamaModel = normalizedModelId.startsWith("ollama:");

	if (
		!selectedModel &&
		!isOpenRouterModel &&
		!isOllamaModel &&
		!isChatGptModel
	) {
		return { success: false, error: "Modelo inválido." };
	}

	let provider: AiProviderId;
	let slug = normalizedModelId;
	if (isChatGptModel) {
		provider = "chatgpt";
		slug = stripProviderPrefix(normalizedModelId, "chatgpt");
		if (!slug) {
			return { success: false, error: "Informe um modelo válido do ChatGPT." };
		}
	} else if (isOpenRouterModel) {
		provider = "openrouter";
		slug = stripProviderPrefix(normalizedModelId, "openrouter");
		if (!slug) {
			return {
				success: false,
				error: "Informe um modelo válido do OpenRouter.",
			};
		}
	} else if (isOllamaModel || selectedModel?.provider === "ollama") {
		provider = "ollama";
		slug = stripProviderPrefix(normalizedModelId, "ollama");
		if (!slug) {
			return { success: false, error: "Informe um modelo válido do Ollama." };
		}
	} else if (selectedModel) {
		provider = selectedModel.provider;
	} else {
		return { success: false, error: "Provider de modelo não suportado." };
	}

	try {
		if (provider === "chatgpt") {
			// Validates that the user has a stored ChatGPT connection before building the model.
			await getSecret(userId, "chatgpt");
			return { success: true, model: buildChatGptModel(userId, slug) };
		}

		const secret = await getSecret(userId, provider);

		switch (provider) {
			case "openrouter":
				return {
					success: true,
					model: createOpenRouter({ apiKey: secret.apiKey }).chat(slug),
				};
			case "ollama":
				return {
					success: true,
					model: createOpenAICompatible({
						name: "ollama",
						baseURL: secret.baseUrl ?? "http://localhost:11434/v1",
						apiKey: secret.apiKey ?? "ollama",
						supportsStructuredOutputs: false,
					}).chatModel(slug),
				};
			case "openai":
				return {
					success: true,
					model: createOpenAI({ apiKey: secret.apiKey })(slug),
				};
			case "anthropic":
				return {
					success: true,
					model: createAnthropic({ apiKey: secret.apiKey })(slug),
				};
			case "google":
				return {
					success: true,
					model: createGoogleGenerativeAI({ apiKey: secret.apiKey })(slug),
				};
			case "minimax":
				return {
					success: true,
					model: createMinimax({ apiKey: secret.apiKey })(slug),
				};
			default:
				return { success: false, error: "Provider de modelo não suportado." };
		}
	} catch (error) {
		if (error instanceof AiCredentialMissingError) {
			return {
				success: false,
				error: "Provedor não configurado. Configure em Ajustes > IA.",
			};
		}
		if (error instanceof AiReconnectRequiredError) {
			return {
				success: false,
				error: "Conexão expirada. Reconecte em Ajustes > IA.",
			};
		}
		if (error instanceof AiCredentialInvalidError) {
			return {
				success: false,
				error: "Credencial inválida. Cadastre de novo em Ajustes > IA.",
			};
		}
		console.error("[ai] failed to resolve language model", error);
		return { success: false, error: "Algo deu errado" };
	}
}
