"use client";

import { RiCheckLine, RiFileCopyLine } from "@remixicon/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
	cancelChatGptConnectionAction,
	pollChatGptConnectionAction,
	removeAiCredentialAction,
	startChatGptConnectionAction,
} from "@/features/settings/actions/ai";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import type { AiCredentialStatus } from "@/shared/lib/ai/credentials/store";
import type { AiUiStatus } from "./provider-status-badge";
import { toUiStatus } from "./provider-status-badge";

interface PendingConnection {
	userCode: string;
	verificationUrl: string;
	pollIntervalSeconds: number;
}

interface ChatGptConnectionProps {
	credential?: AiCredentialStatus;
	onStatusChange: (status: AiUiStatus) => void;
}

const GENERIC_ERROR = "Algo deu errado";

function formatPlan(planType: string) {
	return `Plano ${planType.charAt(0).toUpperCase()}${planType.slice(1)}`;
}

export function ChatGptConnection({
	credential,
	onStatusChange,
}: ChatGptConnectionProps) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [pending, setPending] = useState<PendingConnection | null>(null);
	const [copied, setCopied] = useState(false);
	const status = toUiStatus(credential);

	useEffect(() => {
		if (!pending) return;
		let cancelled = false;
		let timer: ReturnType<typeof setTimeout>;

		const stop = (next: AiUiStatus) => {
			setPending(null);
			onStatusChange(next);
		};

		const poll = async () => {
			const result = await pollChatGptConnectionAction();
			if (cancelled) return;
			if (!result.success || !result.data) {
				toast.error(result.error ?? GENERIC_ERROR);
				stop("none");
				return;
			}
			if (result.data.state === "connected") {
				toast.success("ChatGPT conectado.");
				stop("connected");
				router.refresh();
			} else if (result.data.state === "pending") {
				timer = setTimeout(poll, pending.pollIntervalSeconds * 1000);
			} else {
				stop("none");
			}
		};

		timer = setTimeout(poll, pending.pollIntervalSeconds * 1000);
		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	}, [pending, onStatusChange, router]);

	const handleStart = () => {
		startTransition(async () => {
			const result = await startChatGptConnectionAction();
			if (result.success && result.data) {
				setPending({
					userCode: result.data.userCode,
					verificationUrl: result.data.verificationUrl,
					pollIntervalSeconds: result.data.pollIntervalSeconds,
				});
				onStatusChange("pending");
			} else {
				toast.error(result.error ?? GENERIC_ERROR);
			}
		});
	};

	const handleCancel = () => {
		startTransition(async () => {
			const result = await cancelChatGptConnectionAction();
			if (!result.success) {
				toast.error(result.error ?? GENERIC_ERROR);
				return;
			}
			setPending(null);
			onStatusChange("none");
		});
	};

	const handleDisconnect = () => {
		startTransition(async () => {
			const result = await removeAiCredentialAction("chatgpt");
			if (result.success) {
				toast.success("ChatGPT desconectado.");
				router.refresh();
			} else {
				toast.error(result.error ?? GENERIC_ERROR);
			}
		});
	};

	const handleCopy = async (code: string) => {
		try {
			await navigator.clipboard.writeText(code);
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		} catch {
			toast.error(GENERIC_ERROR);
		}
	};

	if (pending) {
		return (
			<div className="space-y-3">
				<p className="text-sm text-muted-foreground">
					Abra o link abaixo, entre na sua conta e informe o código.
				</p>
				<div className="flex flex-wrap items-center gap-2">
					<code className="rounded-md border bg-muted px-3 py-2 font-mono text-lg tracking-widest">
						{pending.userCode}
					</code>
					<Button
						variant="outline"
						size="sm"
						onClick={() => handleCopy(pending.userCode)}
					>
						{copied ? <RiCheckLine /> : <RiFileCopyLine />}
						{copied ? "Copiado" : "Copiar"}
					</Button>
				</div>
				<a
					href={pending.verificationUrl}
					target="_blank"
					rel="noreferrer"
					className="block text-sm text-primary underline-offset-4 hover:underline"
				>
					{pending.verificationUrl}
				</a>
				<p className="animate-pulse text-sm text-muted-foreground">
					aguardando confirmação...
				</p>
				<Button
					variant="ghost"
					size="sm"
					disabled={isPending}
					onClick={handleCancel}
				>
					Cancelar
				</Button>
			</div>
		);
	}

	if (status === "connected") {
		return (
			<div className="space-y-3">
				<div className="flex flex-wrap items-center gap-2 text-sm">
					{credential?.accountEmail && (
						<span className="font-medium">{credential.accountEmail}</span>
					)}
					{credential?.planType && (
						<Badge variant="secondary">{formatPlan(credential.planType)}</Badge>
					)}
				</div>
				<Button
					variant="outline"
					size="sm"
					disabled={isPending}
					onClick={handleDisconnect}
				>
					Desconectar
				</Button>
			</div>
		);
	}

	return (
		<div className="space-y-3">
			{status === "expired" && (
				<p className="text-sm text-destructive">Sessão expirada, reconecte.</p>
			)}
			{status === "invalid" && (
				<p className="text-sm text-destructive">Cadastre de novo</p>
			)}
			{status === "none" && (
				<p className="text-sm text-muted-foreground">
					Use sua assinatura do ChatGPT, sem precisar de chave de API.
				</p>
			)}
			<Button size="sm" disabled={isPending} onClick={handleStart}>
				Entrar com ChatGPT
			</Button>
		</div>
	);
}
