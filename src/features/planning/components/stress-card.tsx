"use client";

import { formatCents } from "@/features/planning/lib/cents";
import type {
	StressEffect,
	StressToggles,
} from "@/features/planning/lib/engine";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/shared/components/ui/card";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
import { formatShortPeriodLabel } from "@/shared/utils/period";

function toggleLabel(
	toggle: keyof StressToggles,
	configured: StressToggles,
): string {
	switch (toggle) {
		case "contributionCap":
			return `Aporte cai para ${formatCents(configured.contributionCap ?? 0)}`;
		case "incomeLossMonths":
			return `Sem renda por ${configured.incomeLossMonths ?? 0} meses`;
		case "bidAtRangeMax":
			return "Lance no máximo da faixa";
		case "planCostPct":
			return `Planos custam +${configured.planCostPct ?? 0}%`;
	}
}

function impactLabel(effect: StressEffect | undefined): string {
	if (!effect) {
		return "";
	}
	const delta = formatCents(Math.abs(effect.minSlackDelta));
	const sign = effect.minSlackDelta < 0 ? "-" : "+";
	const unfunded = effect.firstUnfundedAfter
		? `primeiro mês descoberto: ${formatShortPeriodLabel(effect.firstUnfundedAfter.month)}`
		: "sem mês descoberto";
	return `Folga mínima ${sign}${delta} · ${unfunded}`;
}

export function StressCard({
	configured,
	effects,
	active,
	onToggle,
}: {
	configured: StressToggles;
	effects: StressEffect[];
	active: StressToggles;
	onToggle: (toggle: keyof StressToggles, enabled: boolean) => void;
}) {
	const toggles = Object.keys(configured) as (keyof StressToggles)[];

	return (
		<Card>
			<CardHeader>
				<CardTitle>Cenários de estresse</CardTitle>
				<CardDescription>
					Ative um cenário para ver o efeito no gráfico e na tabela.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				{toggles.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						Configure o estresse nos ajustes.
					</p>
				) : null}
				{toggles.map((toggle) => (
					<div key={toggle} className="flex items-center justify-between gap-3">
						<div className="min-w-0 space-y-1">
							<Label htmlFor={`stress-${toggle}`}>
								{toggleLabel(toggle, configured)}
							</Label>
							<p className="text-xs text-muted-foreground">
								{impactLabel(
									effects.find((effect) => effect.toggle === toggle),
								)}
							</p>
						</div>
						<Switch
							id={`stress-${toggle}`}
							checked={active[toggle] !== undefined}
							onCheckedChange={(enabled) => onToggle(toggle, enabled)}
						/>
					</div>
				))}
			</CardContent>
		</Card>
	);
}
