import {
	type AiProviderId,
	AVAILABLE_MODELS,
	type ChatGptModel,
	PROVIDERS,
} from "./models";

export type ModelGroup = {
	provider: AiProviderId;
	label: string;
	models: { id: string; name: string }[];
};

const GROUP_LABELS: Partial<Record<AiProviderId, string>> = {
	openai: "OpenAI (API)",
};

const CUSTOM_ID_PREFIXES: Partial<Record<AiProviderId, string>> = {
	openrouter: "openrouter:",
	ollama: "ollama:",
};

export function providerLabel(provider: AiProviderId): string {
	return GROUP_LABELS[provider] ?? PROVIDERS[provider].name;
}

export function buildModelGroups(
	connected: AiProviderId[],
	chatgptModels: ChatGptModel[],
	apiModels: Partial<Record<AiProviderId, { id: string; name: string }[]>> = {},
): ModelGroup[] {
	return (Object.keys(PROVIDERS) as AiProviderId[])
		.filter((provider) => connected.includes(provider))
		.map((provider) => ({
			provider,
			label: providerLabel(provider),
			models:
				provider === "chatgpt"
					? chatgptModels.map(({ id, name }) => ({ id, name }))
					: (apiModels[provider] ??
						AVAILABLE_MODELS.filter((model) => model.provider === provider).map(
							({ id, name }) => ({ id, name }),
						)),
		}));
}

export function pickAvailableModel(
	saved: string | null,
	groups: ModelGroup[],
): string | null {
	if (saved) {
		const listed = groups.some((group) =>
			group.models.some((model) => model.id === saved),
		);
		if (listed) return saved;
		const customKept = groups.some((group) => {
			const prefix = CUSTOM_ID_PREFIXES[group.provider];
			return prefix !== undefined && saved.startsWith(prefix);
		});
		if (customKept) return saved;
	}
	const first = groups.find((group) => group.models.length > 0)?.models[0]?.id;
	if (first) return first;
	// Only custom-model providers (OpenRouter) connected: open their model input.
	const custom = groups.find(
		(group) => CUSTOM_ID_PREFIXES[group.provider] !== undefined,
	);
	return custom ? (CUSTOM_ID_PREFIXES[custom.provider] ?? null) : null;
}
