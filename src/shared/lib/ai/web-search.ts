import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { type LanguageModel, type ToolSet, wrapLanguageModel } from "ai";
import { AVAILABLE_MODELS } from "./models";

export function resolveWebSearchTools(modelId: string): ToolSet {
	const provider = AVAILABLE_MODELS.find(
		(m) => m.id === modelId.trim(),
	)?.provider;

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

const WEB_SEARCH_ERROR = /web[ _-]?search|google[ _-]?search|search[ _-]?grounding|\btools?\b/i;

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
