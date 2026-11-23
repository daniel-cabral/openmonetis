"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
	type AiProviderId,
	DEFAULT_PROVIDER,
} from "@/features/insights/constants";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import type { ModelGroup } from "@/shared/lib/ai/model-groups";
import { AnalysisSummaryCard } from "./analysis-summary-card";
import { CUSTOM_MODEL_VALUE, ModelSelectionCard } from "./model-selection-card";
import { ProviderSelectionCard } from "./provider-selection-card";

interface ModelSelectorProps {
	value: string | null;
	modelGroups: ModelGroup[];
	onValueChange: (value: string) => void;
	period: string;
	onAnalyze: () => void;
	userInstructions: string;
	onUserInstructionsChange: (value: string) => void;
	onCancel?: () => void;
	disabled?: boolean;
	isLoadingSavedInsights?: boolean;
}

const CUSTOM_MODEL_PROVIDERS = ["openrouter", "ollama"] as const;

function isCustomModelProvider(
	provider: AiProviderId,
): provider is (typeof CUSTOM_MODEL_PROVIDERS)[number] {
	return CUSTOM_MODEL_PROVIDERS.includes(
		provider as (typeof CUSTOM_MODEL_PROVIDERS)[number],
	);
}

function getProviderFromValue(
	value: string,
	groups: ModelGroup[],
): AiProviderId | null {
	const group = groups.find((item) =>
		item.models.some((model) => model.id === value),
	);
	if (group) {
		return group.provider;
	}

	if (value.startsWith("chatgpt:")) {
		return "chatgpt";
	}

	if (value.startsWith("openrouter:")) {
		return "openrouter";
	}

	if (value.startsWith("ollama:")) {
		return "ollama";
	}

	if (value.includes("/")) {
		return "openrouter";
	}

	return null;
}

function stripCustomProviderPrefix(value: string, provider: AiProviderId) {
	if (!isCustomModelProvider(provider)) {
		return value;
	}

	return value.startsWith(`${provider}:`)
		? value.slice(`${provider}:`.length)
		: value;
}

function getModelLabel(modelId: string, groups: ModelGroup[]) {
	const model = groups
		.flatMap((group) => group.models)
		.find((item) => item.id === modelId);
	if (model) return model.name;

	const provider = getProviderFromValue(modelId, groups);
	return provider ? stripCustomProviderPrefix(modelId, provider) : modelId;
}

export function ModelSelector({
	value: selectedValue,
	modelGroups,
	onValueChange,
	period,
	onAnalyze,
	userInstructions,
	onUserInstructionsChange,
	onCancel,
	disabled,
	isLoadingSavedInsights,
}: ModelSelectorProps) {
	const value = selectedValue ?? "";
	const [customModel, setCustomModel] = useState(value);

	useEffect(() => {
		const detectedProvider = getProviderFromValue(value, modelGroups);
		if (detectedProvider && isCustomModelProvider(detectedProvider)) {
			setCustomModel(stripCustomProviderPrefix(value, detectedProvider));
			return;
		}

		setCustomModel(value);
	}, [value, modelGroups]);

	const currentProvider =
		getProviderFromValue(value, modelGroups) ?? DEFAULT_PROVIDER;

	const modelsByProvider = useMemo(() => {
		const grouped: Record<AiProviderId, Array<{ id: string; name: string }>> = {
			chatgpt: [],
			openai: [],
			anthropic: [],
			google: [],
			minimax: [],
			openrouter: [],
			ollama: [],
		};

		for (const group of modelGroups) {
			grouped[group.provider] = group.models;
		}

		return grouped;
	}, [modelGroups]);

	const providerModels = modelsByProvider[currentProvider];
	const selectedModelIsKnown = providerModels.some(
		(model) => model.id === value,
	);
	const selectValue = selectedModelIsKnown ? value : CUSTOM_MODEL_VALUE;
	const isCustomModelActive =
		isCustomModelProvider(currentProvider) && !selectedModelIsKnown;
	const selectedModelLabel = getModelLabel(value, modelGroups);
	const canAnalyze =
		selectedValue !== null &&
		!disabled &&
		!isLoadingSavedInsights &&
		selectedModelLabel.trim().length > 0;

	const handleProviderChange = (newProvider: AiProviderId) => {
		if (newProvider === "openrouter") {
			setCustomModel("");
			onValueChange("openrouter:");
			return;
		}

		const firstModel = modelsByProvider[newProvider][0];
		if (firstModel) {
			onValueChange(firstModel.id);
			return;
		}

		if (isCustomModelProvider(newProvider)) {
			onValueChange(
				customModel ? `${newProvider}:${customModel}` : `${newProvider}:`,
			);
		}
	};

	const handleModelSelect = (modelId: string) => {
		if (modelId === CUSTOM_MODEL_VALUE) {
			setCustomModel("");
			onValueChange(`${currentProvider}:`);
			return;
		}

		onValueChange(modelId);
	};

	const handleCustomModelChange = (modelName: string) => {
		setCustomModel(modelName);
		onValueChange(`${currentProvider}:${modelName}`);
	};

	if (selectedValue === null) {
		return (
			<Card className="border-border/70 bg-card/95 shadow-sm">
				<CardContent className="flex flex-col items-start gap-4">
					<p className="text-muted-foreground text-sm">
						Nenhum provedor de IA configurado.{" "}
						<Link href="/settings?tab=ia" className="underline">
							Configurar em Ajustes &gt; IA
						</Link>
					</p>
					<Button disabled>Gerar insights</Button>
				</CardContent>
			</Card>
		);
	}

	return (
		<section className="space-y-4">
			<div className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
				<div className="space-y-4">
					<ProviderSelectionCard
						currentProvider={currentProvider}
						providers={modelGroups.map((group) => group.provider)}
						disabled={disabled}
						onProviderChange={handleProviderChange}
					/>

					<ModelSelectionCard
						currentProvider={currentProvider}
						providerModels={providerModels}
						selectValue={selectValue}
						customModel={customModel}
						isCustomModelActive={isCustomModelActive}
						canUseCustomModel={isCustomModelProvider(currentProvider)}
						canAnalyze={canAnalyze}
						disabled={disabled}
						onModelSelect={handleModelSelect}
						onCustomModelChange={handleCustomModelChange}
						onCancel={onCancel}
						onAnalyze={onAnalyze}
					/>
				</div>

				<AnalysisSummaryCard
					period={period}
					currentProvider={currentProvider}
					selectedModelLabel={selectedModelLabel}
					userInstructions={userInstructions}
					onUserInstructionsChange={onUserInstructionsChange}
				/>
			</div>
		</section>
	);
}
