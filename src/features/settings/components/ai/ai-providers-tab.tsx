"use client";

import { RiLockLine } from "@remixicon/react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { Separator } from "@/shared/components/ui/separator";
import type { AiCredentialStatus } from "@/shared/lib/ai/credentials/store";
import type { AiProviderId } from "@/shared/lib/ai/models";
import { ApiKeyForm } from "./api-key-form";
import { ChatGptConnection } from "./chatgpt-connection";
import { AI_PROVIDER_LIST } from "./provider-list";
import {
	type AiUiStatus,
	ProviderStatusBadge,
	toUiStatus,
} from "./provider-status-badge";

interface AiProvidersTabProps {
	credentials: AiCredentialStatus[];
}

const DOT_CLASS: Record<AiUiStatus, string> = {
	connected: "bg-success",
	none: "bg-muted-foreground/30",
	pending: "bg-info",
	expired: "bg-destructive",
	invalid: "bg-destructive",
};

export function AiProvidersTab({ credentials }: AiProvidersTabProps) {
	const [selected, setSelected] = useState<AiProviderId>("chatgpt");
	const current =
		AI_PROVIDER_LIST.find((provider) => provider.id === selected) ??
		AI_PROVIDER_LIST[0];
	const [chatGptLive, setChatGptLive] = useState<AiUiStatus | null>(null);
	const handleChatGptStatus = useCallback((status: AiUiStatus) => {
		setChatGptLive(
			status === "pending" || status === "connected" ? status : null,
		);
	}, []);
	// Fresh server data supersedes the transient client-side status.
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset on new credentials
	useEffect(() => setChatGptLive(null), [credentials]);
	const statusOf = (id: AiProviderId) =>
		id === "chatgpt" && chatGptLive
			? chatGptLive
			: toUiStatus(credentialOf(id));
	const credentialOf = (id: AiProviderId) =>
		credentials.find((credential) => credential.provider === id);
	const currentCredential = credentialOf(current.id);
	const currentStatus = statusOf(current.id);

	return (
		<div className="grid gap-4 md:grid-cols-[260px_1fr]">
			<div className="space-y-1 rounded-lg border p-1">
				{AI_PROVIDER_LIST.map((provider) => (
					<Button
						key={provider.id}
						variant={selected === provider.id ? "secondary" : "ghost"}
						className="h-auto w-full justify-start gap-3 px-3 py-2"
						onClick={() => setSelected(provider.id)}
					>
						<img
							src={provider.logo}
							alt={provider.name}
							className="size-6 shrink-0 object-contain"
						/>
						<span className="min-w-0 flex-1 truncate text-left">
							{provider.name}
						</span>
						<span
							className={`size-2 rounded-full ${DOT_CLASS[statusOf(provider.id)]}`}
						/>
					</Button>
				))}
			</div>
			<div className="space-y-4 rounded-lg border p-5">
				<div className="flex items-center gap-3">
					<img
						src={current.logo}
						alt={current.name}
						className="size-6 shrink-0 object-contain"
					/>
					<h3 className="flex-1 font-semibold">{current.name}</h3>
					<ProviderStatusBadge status={currentStatus} />
				</div>
				<Separator />
				{current.id === "chatgpt" ? (
					<ChatGptConnection
						credential={currentCredential}
						onStatusChange={handleChatGptStatus}
					/>
				) : (
					<ApiKeyForm
						key={current.id}
						provider={current.id}
						credential={currentCredential}
						status={currentStatus}
					/>
				)}
				<p className="flex items-center gap-1.5 text-xs text-muted-foreground">
					<RiLockLine className="size-3.5" />
					As chaves ficam criptografadas e só são usadas por você.
				</p>
			</div>
		</div>
	);
}
