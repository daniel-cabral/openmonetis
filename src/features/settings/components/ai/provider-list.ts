import type { AiProviderId } from "@/shared/lib/ai/models";
import { PROVIDERS } from "@/shared/lib/ai/models";

export const AI_PROVIDER_LIST: {
	id: AiProviderId;
	name: string;
	logo: string;
}[] = [
	{
		id: "chatgpt",
		name: "ChatGPT (assinatura)",
		logo: "/providers/chatgpt.svg",
	},
	{
		id: "openai",
		name: `${PROVIDERS.openai.name} (API)`,
		logo: "/providers/chatgpt.svg",
	},
	{
		id: "anthropic",
		name: PROVIDERS.anthropic.name,
		logo: "/providers/claude.svg",
	},
	{
		id: "google",
		name: PROVIDERS.google.name,
		logo: "/providers/gemini.svg",
	},
	{
		id: "minimax",
		name: PROVIDERS.minimax.name,
		logo: "/providers/minimax.svg",
	},
	{
		id: "openrouter",
		name: PROVIDERS.openrouter.name,
		logo: "/providers/openrouter_light.svg",
	},
	{
		id: "ollama",
		name: PROVIDERS.ollama.name,
		logo: "/providers/ollama_light.svg",
	},
];
