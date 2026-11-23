"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
	removeAiCredentialAction,
	saveAiApiKeyAction,
} from "@/features/settings/actions/ai";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import type { AiCredentialStatus } from "@/shared/lib/ai/credentials/store";
import type { AiProviderId } from "@/shared/lib/ai/models";
import type { AiUiStatus } from "./provider-status-badge";

interface ApiKeyFormProps {
	provider: Exclude<AiProviderId, "chatgpt">;
	credential?: AiCredentialStatus;
	status: AiUiStatus;
}

export function ApiKeyForm({ provider, credential, status }: ApiKeyFormProps) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [editing, setEditing] = useState(false);
	const [apiKey, setApiKey] = useState("");
	const [baseUrl, setBaseUrl] = useState(credential?.baseUrl ?? "");
	const isOllama = provider === "ollama";
	const saved = status === "connected";
	const showInputs = !saved || editing;

	const handleSave = (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		startTransition(async () => {
			const result = await saveAiApiKeyAction(
				isOllama
					? { provider, baseUrl, apiKey: apiKey || undefined }
					: { provider, apiKey },
			);
			if (result.success) {
				toast.success("Credencial salva.");
				setApiKey("");
				setEditing(false);
				router.refresh();
			} else {
				toast.error(result.error);
			}
		});
	};

	const handleRemove = () => {
		startTransition(async () => {
			const result = await removeAiCredentialAction(provider);
			if (result.success) {
				toast.success("Credencial removida.");
				setApiKey("");
				setEditing(false);
				router.refresh();
			} else {
				toast.error(result.error);
			}
		});
	};

	if (!showInputs) {
		return (
			<div className="flex flex-wrap items-center gap-2">
				<code className="rounded-md border bg-muted px-3 py-2 font-mono text-sm">
					{isOllama ? credential?.baseUrl : credential?.secretMask}
				</code>
				<Button
					variant="outline"
					size="sm"
					disabled={isPending}
					onClick={() => setEditing(true)}
				>
					Alterar
				</Button>
				<Button
					variant="ghost"
					size="sm"
					className="text-destructive"
					disabled={isPending}
					onClick={handleRemove}
				>
					Remover
				</Button>
			</div>
		);
	}

	return (
		<form onSubmit={handleSave} className="space-y-3">
			{status === "invalid" && (
				<p className="text-sm text-destructive">Cadastre de novo</p>
			)}
			{isOllama && (
				<div className="space-y-1.5">
					<Label htmlFor={`url-${provider}`}>URL base</Label>
					<Input
						id={`url-${provider}`}
						value={baseUrl}
						placeholder="http://localhost:11434/v1"
						onChange={(event) => setBaseUrl(event.target.value)}
						disabled={isPending}
					/>
				</div>
			)}
			<div className="space-y-1.5">
				<Label htmlFor={`key-${provider}`}>
					{isOllama ? "Chave (opcional)" : "Chave de API"}
				</Label>
				<div className="flex gap-2">
					<Input
						id={`key-${provider}`}
						type="password"
						autoComplete="off"
						value={apiKey}
						placeholder={isOllama ? "Chave (opcional)" : "Cole a chave de API"}
						onChange={(event) => setApiKey(event.target.value)}
						disabled={isPending}
					/>
					<Button type="submit" disabled={isPending}>
						Salvar
					</Button>
					{editing && (
						<Button
							type="button"
							variant="ghost"
							disabled={isPending}
							onClick={() => {
								setEditing(false);
								setApiKey("");
							}}
						>
							Cancelar
						</Button>
					)}
				</div>
			</div>
		</form>
	);
}
