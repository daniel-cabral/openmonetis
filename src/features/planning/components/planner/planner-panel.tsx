"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
	savePlanningSettingsAction,
	startPlannerConversationAction,
} from "@/features/planning/actions";
import type { ProposalToolOutput } from "@/features/planning/lib/planner/tools";
import type { PlanningSettingsInput } from "@/features/planning/lib/schemas";
import { Button } from "@/shared/components/ui/button";
import {
	Card,
	CardAction,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/shared/components/ui/card";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import type { ModelGroup } from "@/shared/lib/ai/model-groups";
import { Composer } from "./composer";
import { MessageBubble } from "./message-bubble";

export type PlannerPanelProps = {
	conversation: { id: string; messages: UIMessage[] } | null;
	modelId: string | null;
	modelGroups: ModelGroup[];
	settings: PlanningSettingsInput;
	prefill?: string | null;
	onPrefillConsumed?: () => void;
	renderProposal?: (
		output: ProposalToolOutput,
		toolCallId: string,
	) => ReactNode;
};

export function PlannerPanel({
	conversation,
	modelId: initialModelId,
	modelGroups,
	settings,
	prefill,
	onPrefillConsumed,
	renderProposal,
}: PlannerPanelProps) {
	const router = useRouter();
	const [conversationId, setConversationId] = useState(
		conversation?.id ?? null,
	);
	const [modelId, setModelId] = useState<string | null>(initialModelId);
	const [input, setInput] = useState("");
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const scrollRef = useRef<HTMLDivElement>(null);

	const { messages, sendMessage, setMessages, status, stop, error } = useChat({
		messages: conversation?.messages ?? [],
		transport: new DefaultChatTransport({
			api: "/api/planning/chat",
			// Per-request conversation and model travel in sendMessage's body, so the transport holds no stale state.
			prepareSendMessagesRequest: ({ messages: history, body }) => ({
				body: {
					conversationId: body?.conversationId,
					modelId: body?.modelId,
					message: history.at(-1),
				},
			}),
		}),
	});

	const busy = status === "submitted" || status === "streaming";

	useEffect(() => {
		const scroller = scrollRef.current;
		if (scroller) scroller.scrollTop = scroller.scrollHeight;
	}, [messages]);

	useEffect(() => {
		if (!prefill) return;
		setInput(prefill);
		inputRef.current?.focus();
		onPrefillConsumed?.();
	}, [prefill, onPrefillConsumed]);

	const send = async () => {
		const text = input.trim();
		if (!text || busy || !modelId) return;
		setInput("");

		let activeId = conversationId;
		if (!activeId) {
			const created = await startPlannerConversationAction({});
			if (!created.success || !created.data) {
				toast.error(created.success ? "Algo deu errado." : created.error);
				setInput(text);
				return;
			}
			activeId = created.data.conversationId;
			setConversationId(activeId);
			router.refresh();
		}
		sendMessage({ text }, { body: { conversationId: activeId, modelId } });
	};

	const startNewConversation = () => {
		if (busy) return;
		setConversationId(null);
		setMessages([]);
		setInput("");
	};

	const changeModel = async (value: string) => {
		setModelId(value);
		const result = await savePlanningSettingsAction({
			...settings,
			plannerModelId: value,
		});
		if (!result.success) toast.error(result.error);
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>Planejador</CardTitle>
				<CardAction>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={startNewConversation}
						disabled={busy}
					>
						Nova conversa
					</Button>
				</CardAction>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{modelId === null ? (
					<p className="text-muted-foreground text-sm">
						Nenhum provedor de IA configurado.{" "}
						<Link href="/settings?tab=ia" className="underline">
							Configurar em Ajustes &gt; IA
						</Link>
					</p>
				) : (
				<Select value={modelId} onValueChange={changeModel}>
					<SelectTrigger
						size="sm"
						className="w-full"
						aria-label="Modelo do planejador"
					>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{modelGroups
							.filter((group) => group.models.length > 0)
							.map((group) => (
								<SelectGroup key={group.provider}>
									<SelectLabel>{group.label}</SelectLabel>
									{group.models.map((model) => (
										<SelectItem key={model.id} value={model.id}>
											{model.name}
										</SelectItem>
									))}
								</SelectGroup>
							))}
					</SelectContent>
				</Select>
				)}
				<div
					ref={scrollRef}
					className="flex max-h-[420px] min-h-40 flex-col gap-3 overflow-y-auto"
				>
					{messages.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							Pergunte sobre metas, cortes ou cenários. O planejador consulta
							seus dados e só aplica mudanças quando você confirma.
						</p>
					) : (
						messages.map((message) => (
							<MessageBubble
								key={message.id}
								message={message}
								renderProposal={renderProposal}
							/>
						))
					)}
					{error ? (
						<p className="text-destructive text-sm">
							Não foi possível concluir a resposta. Tente novamente.
						</p>
					) : null}
				</div>
				<Composer
					ref={inputRef}
					value={input}
					onChange={setInput}
					onSubmit={send}
					onStop={stop}
					busy={busy}
					disabled={modelId === null}
				/>
				<p className="text-muted-foreground text-xs">
					Os dados financeiros desta página são enviados ao provedor do modelo
					selecionado.
				</p>
			</CardContent>
		</Card>
	);
}
