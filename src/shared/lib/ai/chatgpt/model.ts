import { createOpenAI } from "@ai-sdk/openai";
import { type LanguageModel, wrapLanguageModel } from "ai";
import { AiReconnectRequiredError } from "../credentials/errors";
import { CHATGPT_API_BASE, CHATGPT_ORIGINATOR } from "./constants";
import {
	type ChatGptAccessToken,
	getChatGptAccessToken,
	markChatGptNeedsReconnect,
} from "./credentials";
import { streamToGenerateMiddleware } from "./stream-to-generate";

export type ChatGptModelDeps = {
	fetch?: typeof fetch;
	getAccessToken?: () => Promise<ChatGptAccessToken>;
	markNeedsReconnect?: (userId: string) => Promise<void>;
};

export function createChatGptModel(
	userId: string,
	slug: string,
	deps: ChatGptModelDeps = {},
): LanguageModel {
	const baseFetch = deps.fetch ?? globalThis.fetch;
	const getAccessToken =
		deps.getAccessToken ?? (() => getChatGptAccessToken(userId));
	const markNeedsReconnect =
		deps.markNeedsReconnect ?? markChatGptNeedsReconnect;

	const chatGptFetch: typeof fetch = async (input, init) => {
		const { accessToken, accountId } = await getAccessToken();
		const headers = new Headers(init?.headers);
		headers.set("authorization", `Bearer ${accessToken}`);
		headers.set("chatgpt-account-id", accountId);
		headers.set("originator", CHATGPT_ORIGINATOR);
		const response = await baseFetch(input, { ...init, headers });
		if (response.status === 401) {
			await markNeedsReconnect(userId);
			throw new AiReconnectRequiredError("chatgpt");
		}
		return response;
	};

	const provider = createOpenAI({
		apiKey: "chatgpt-subscription",
		baseURL: CHATGPT_API_BASE,
		fetch: chatGptFetch,
	});

	return wrapLanguageModel({
		model: provider.responses(slug),
		middleware: [
			{
				specificationVersion: "v3",
				// The Codex backend requires `instructions` and rejects store: true.
				transformParams: async ({ params }) => {
					const system = params.prompt.filter(
						(message) => message.role === "system",
					);
					const existing = params.providerOptions?.openai?.instructions;
					return {
						...params,
						prompt: params.prompt.filter(
							(message) => message.role !== "system",
						),
						providerOptions: {
							...params.providerOptions,
							openai: {
								...params.providerOptions?.openai,
								store: false,
								...(system.length > 0 && typeof existing !== "string"
									? {
											instructions: system
												.map((message) => message.content)
												.join("\n\n"),
										}
									: {}),
							},
						},
					};
				},
			},
			streamToGenerateMiddleware,
		],
	});
}
