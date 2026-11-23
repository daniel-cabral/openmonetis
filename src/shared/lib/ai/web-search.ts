import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import type { ToolSet } from "ai";
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
