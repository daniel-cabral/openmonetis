"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { applyProposalAction } from "@/features/planning/actions";
import { formatCents } from "@/features/planning/lib/cents";
import type { PlanHealth } from "@/features/planning/lib/engine";
import { describeChange } from "@/features/planning/lib/planner/describe-change";
import type { ProposalToolOutput } from "@/features/planning/lib/planner/tools";
import { Button } from "@/shared/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/shared/components/ui/card";
import { formatShortPeriodLabel } from "@/shared/utils/period";

const HEALTH_LABEL: Record<PlanHealth, string> = {
	"on-track": "Em dia",
	"at-risk": "Em risco",
	"off-track": "Fora do eixo",
};

/**
 * Proposal produced by the planner. Figures come from the deterministic diff
 * computed on the server; the card only formats them. `onPreview` toggles the
 * preview of this proposal on the chart and table.
 */
export function ProposalCard({
	output,
	applied,
	previewing,
	onPreview,
	onDiscard,
}: {
	output: ProposalToolOutput;
	applied: boolean;
	previewing: boolean;
	onPreview: () => void;
	onDiscard: () => void;
}) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [discarded, setDiscarded] = useState(false);

	if ("error" in output) {
		return (
			<p className="text-muted-foreground text-sm">
				Proposta inválida: {output.error}
			</p>
		);
	}

	if (discarded) {
		return <p className="text-muted-foreground text-sm">Proposta descartada.</p>;
	}

	const { proposalId, proposal, diff, current } = output;

	const apply = () =>
		startTransition(async () => {
			const result = await applyProposalAction({ proposalId, proposal });

			if (result.success) {
				toast.success(result.message);
				router.refresh();
				return;
			}

			toast.error(result.error);
		});

	const discard = () => {
		setDiscarded(true);
		onDiscard();
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>{proposal.title}</CardTitle>
				<CardDescription>{proposal.rationale}</CardDescription>
			</CardHeader>
			<CardContent className="space-y-3 text-sm">
				<ul className="list-disc space-y-2 pl-5">
					{proposal.changes.map((change, index) => {
						const { title, lines } = describeChange(change, current);
						return (
							<li key={index}>
								{title}
								{lines.length > 0 && (
									<ul className="mt-1 space-y-0.5 text-muted-foreground text-xs tabular-nums">
										{lines.map((line) => (
											<li key={line}>{line}</li>
										))}
									</ul>
								)}
							</li>
						);
					})}
				</ul>
				<ul className="space-y-1 text-xs tabular-nums">
					{diff.healthChanges.map((change, index) => (
						<li key={index}>
							{change.name}:{" "}
							{change.from ? HEALTH_LABEL[change.from] : "Novo plano"} →{" "}
							{HEALTH_LABEL[change.to]}
						</li>
					))}
					<li>
						Primeiro mês sem cobertura:{" "}
						{diff.firstUnfundedBase.from
							? formatShortPeriodLabel(diff.firstUnfundedBase.from)
							: "nenhum"}{" "}
						→{" "}
						{diff.firstUnfundedBase.to
							? formatShortPeriodLabel(diff.firstUnfundedBase.to)
							: "nenhum"}
					</li>
					<li>
						Folga mínima:{" "}
						{diff.minSlackBaseDelta > 0 ? "+" : ""}
						{formatCents(diff.minSlackBaseDelta)}
					</li>
				</ul>
				<div className="flex flex-wrap gap-2">
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={onPreview}
						disabled={applied}
					>
						{previewing ? "Sair da prévia" : "Pré-visualizar"}
					</Button>
					<Button
						type="button"
						size="sm"
						onClick={apply}
						disabled={applied || isPending}
					>
						{applied ? "Aplicada" : "Aplicar"}
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={discard}
						disabled={applied || isPending}
					>
						Descartar
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}
