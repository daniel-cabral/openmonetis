/**
 * Tipos de providers disponíveis
 */
export type AIProvider =
	| "openai"
	| "anthropic"
	| "google"
	| "minimax"
	| "openrouter"
	| "ollama";

/**
 * Providers configuráveis em Ajustes > IA (chaves de API + assinatura do ChatGPT)
 */
export type AiProviderId = "chatgpt" | AIProvider;

/**
 * Metadados dos providers
 */
export const PROVIDERS = {
	openai: {
		id: "openai" as const,
		name: "ChatGPT",
	},
	anthropic: {
		id: "anthropic" as const,
		name: "Claude AI",
	},
	google: {
		id: "google" as const,
		name: "Gemini",
	},
	minimax: {
		id: "minimax" as const,
		name: "MiniMax",
	},
	openrouter: {
		id: "openrouter" as const,
		name: "OpenRouter",
	},
	ollama: {
		id: "ollama" as const,
		name: "Ollama",
	},
} as const;

/**
 * Lista de modelos de IA disponíveis no app
 */
export const AVAILABLE_MODELS = [
	// OpenAI
	{ id: "gpt-5.5-pro", name: "GPT-5.5 Pro", provider: "openai" as const },
	{ id: "gpt-5.5", name: "GPT-5.5", provider: "openai" as const },
	{ id: "gpt-5.4", name: "GPT-5.4", provider: "openai" as const },
	{ id: "gpt-5.4-mini", name: "GPT-5.4 Mini", provider: "openai" as const },
	{ id: "gpt-5.4-nano", name: "GPT-5.4 Nano", provider: "openai" as const },

	// Anthropic
	{
		id: "claude-opus-4-8",
		name: "Claude Opus 4.8",
		provider: "anthropic" as const,
	},
	{
		id: "claude-sonnet-4-6",
		name: "Claude Sonnet 4.6",
		provider: "anthropic" as const,
	},
	{
		id: "claude-haiku-4-5-20251001",
		name: "Claude Haiku 4.5",
		provider: "anthropic" as const,
	},

	// Google
	{
		id: "gemini-3.1-pro-preview",
		name: "Gemini 3.1 Pro",
		provider: "google" as const,
	},
	{
		id: "gemini-3-flash-preview",
		name: "Gemini 3 Flash",
		provider: "google" as const,
	},
	{
		id: "gemini-3.1-flash-lite-preview",
		name: "Gemini 3.1 Flash Lite",
		provider: "google" as const,
	},

	// MiniMax
	{
		id: "MiniMax-M2.7",
		name: "MiniMax M2.7",
		provider: "minimax" as const,
	},
	{
		id: "MiniMax-M2.7-highspeed",
		name: "MiniMax M2.7 Highspeed",
		provider: "minimax" as const,
	},
	{
		id: "MiniMax-M2.5",
		name: "MiniMax M2.5",
		provider: "minimax" as const,
	},
	{
		id: "MiniMax-M2.5-highspeed",
		name: "MiniMax M2.5 Highspeed",
		provider: "minimax" as const,
	},
	{
		id: "MiniMax-M2.1",
		name: "MiniMax M2.1",
		provider: "minimax" as const,
	},
	{
		id: "MiniMax-M2.1-highspeed",
		name: "MiniMax M2.1 Highspeed",
		provider: "minimax" as const,
	},
	{
		id: "MiniMax-M2",
		name: "MiniMax M2",
		provider: "minimax" as const,
	},

	// Ollama
	{ id: "ollama:llama3.2", name: "Llama 3.2", provider: "ollama" as const },
	{ id: "ollama:llama3.1", name: "Llama 3.1", provider: "ollama" as const },
	{ id: "ollama:qwen2.5", name: "Qwen 2.5", provider: "ollama" as const },
	{ id: "ollama:mistral", name: "Mistral", provider: "ollama" as const },
] as const;

export type ChatGptModel = {
	id: string;
	name: string;
	provider: "chatgpt";
};

/**
 * Lista usada quando o backend do ChatGPT (assinatura) não responde
 */
export const CHATGPT_FALLBACK_MODELS: ChatGptModel[] = [
	{ id: "chatgpt:gpt-5.5", name: "GPT-5.5", provider: "chatgpt" },
	{ id: "chatgpt:gpt-5.4", name: "GPT-5.4", provider: "chatgpt" },
];

export const DEFAULT_MODEL = "gpt-5.5";
export const DEFAULT_PROVIDER = "openai";
