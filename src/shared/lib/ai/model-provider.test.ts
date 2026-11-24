import { describe, expect, it, vi } from "vitest";
import {
	AiCredentialInvalidError,
	AiCredentialMissingError,
	AiReconnectRequiredError,
} from "./credentials/errors";
import { resolveLanguageModel } from "./model-provider";

const NOT_CONFIGURED = "Provedor não configurado. Configure em Ajustes > IA.";

describe("resolveLanguageModel", () => {
	it("resolves only from the user's own credentials", async () => {
		vi.stubEnv("ANTHROPIC_API_KEY", "env");
		const stored: Record<string, { apiKey?: string; baseUrl?: string }> = {
			ollama: { baseUrl: "http://lan:11434/v1" },
			chatgpt: {},
		};
		const getSecret = vi.fn(async (_userId: string, provider: string) => {
			const secret = stored[provider];
			if (!secret) throw new AiCredentialMissingError(provider);
			return secret;
		});
		const chatGptModel = { modelId: "gpt-5.5" };
		const createChatGptModel = vi.fn(() => chatGptModel as never);
		const deps = { getSecret, createChatGptModel } as never;

		expect(await resolveLanguageModel("u1", "claude-sonnet-5-5", deps)).toEqual(
			{ success: false, error: NOT_CONFIGURED },
		);
		expect(
			(await resolveLanguageModel("u1", "ollama:llama3.2", deps)).success,
		).toBe(true);
		expect(await resolveLanguageModel("u1", "chatgpt:gpt-5.5", deps)).toEqual({
			success: true,
			model: chatGptModel,
		});
		expect(createChatGptModel).toHaveBeenCalledWith("u1", "gpt-5.5");

		getSecret.mockRejectedValueOnce(new AiReconnectRequiredError("chatgpt"));
		expect(await resolveLanguageModel("u1", "chatgpt:gpt-5.5", deps)).toEqual({
			success: false,
			error: "Conexão expirada. Reconecte em Ajustes > IA.",
		});
		getSecret.mockRejectedValueOnce(new AiCredentialInvalidError("openai"));
		expect(await resolveLanguageModel("u1", "gpt-5.5", deps)).toEqual({
			success: false,
			error: "Credencial inválida. Cadastre de novo em Ajustes > IA.",
		});
		vi.unstubAllEnvs();
	});
});
