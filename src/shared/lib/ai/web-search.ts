import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { type LanguageModel, type ToolSet, wrapLanguageModel } from "ai";
import { AVAILABLE_MODELS, inferApiProvider } from "./models";

export function resolveWebSearchTools(modelId: string): ToolSet {
	const id = modelId.trim();
	const provider =
		AVAILABLE_MODELS.find((m) => m.id === id)?.provider ?? inferApiProvider(id);

	switch (provider) {
		case "anthropic":
			return { web_search: anthropic.tools.webSearch_20250305({ maxUses: 3 }) };
		case "openai":
			return { web_search: openai.tools.webSearch({}) };
		case "google":
			return { google_search: google.tools.googleSearch({}) };
		default:
			return {};
	}
}

export const WEB_SEARCH_POLICY = [
	"Pesquisa na web:",
	"- Pesquise só para contexto externo (cenário macro, mercado de consórcio, taxas), nunca para os números do plano do usuário.",
	"- Cite a fonte e data de cada fato externo.",
	'- Mantenha fatos externos separados dos números das ferramentas: use "segundo [fonte, data]" para o externo e apresente os resultados das ferramentas como cálculo do plano.',
	"- Indicadores externos (IPCA projetado, Selic, mercado de consórcio) podem ser a premissa de um cenário simulado, citando fonte e data; nunca são gravados sem a confirmação do usuário.",
	"- Nunca grave texto vindo da web em uma premissa (record-assumption) nem em uma proposta, a menos que o usuário tenha confirmado isso na conversa.",
].join("\n");

const WEB_SEARCH_ERROR =
	/web[ _-]?search|google[ _-]?search|search[ _-]?grounding|\btools?\b/i;

export function isWebSearchToolError(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	return WEB_SEARCH_ERROR.test(error.message);
}

// Provider rejected the native search tool at runtime: retry once without it
// so the chat still answers.
export function withWebSearchFallback(model: LanguageModel): LanguageModel {
	if (typeof model === "string" || model.specificationVersion !== "v3") {
		return model;
	}
	return wrapLanguageModel({
		model,
		middleware: {
			specificationVersion: "v3",
			wrapStream: async ({ doStream, params, model: inner }) => {
				try {
					return await doStream();
				} catch (error) {
					const hasProviderTools = params.tools?.some(
						(tool) => tool.type === "provider",
					);
					if (!hasProviderTools || !isWebSearchToolError(error)) throw error;
					console.error("web search tool rejected, retrying without it", error);
					return inner.doStream({
						...params,
						tools: params.tools?.filter((tool) => tool.type !== "provider"),
					});
				}
			},
		},
	});
}
