"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { savePlanningSettingsAction } from "@/features/planning/actions";
import { centsToDecimal, toCents } from "@/features/planning/lib/cents";
import type { PlanningSettingsInput } from "@/features/planning/lib/schemas";
import { Button } from "@/shared/components/ui/button";
import { CurrencyInput } from "@/shared/components/ui/currency-input";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";

type SettingsForm = {
	plannedContribution: string;
	reserveMonths: string;
	baselineMonths: string;
	ipca: string;
	incc: string;
	horizonEnd: string;
	stressContributionCap: string;
	stressIncomeLossMonths: string;
	stressPlanCostPct: string;
};

function toForm(settings: PlanningSettingsInput): SettingsForm {
	return {
		plannedContribution: centsToDecimal(settings.plannedContribution),
		reserveMonths: String(settings.reserveMonths),
		baselineMonths: String(settings.baselineMonths),
		ipca: String(settings.indexForecastPct.IPCA),
		incc: String(settings.indexForecastPct.INCC),
		horizonEnd: settings.horizonEnd ?? "",
		stressContributionCap:
			settings.stressContributionCap === null
				? ""
				: centsToDecimal(settings.stressContributionCap),
		stressIncomeLossMonths: String(settings.stressIncomeLossMonths),
		stressPlanCostPct: String(settings.stressPlanCostPct),
	};
}

function toSettings(
	form: SettingsForm,
	current: PlanningSettingsInput,
): PlanningSettingsInput {
	return {
		plannedContribution: toCents(form.plannedContribution),
		reserveMonths: Number(form.reserveMonths),
		baselineMonths: Number(form.baselineMonths),
		indexForecastPct: { IPCA: Number(form.ipca), INCC: Number(form.incc) },
		horizonEnd: form.horizonEnd || null,
		stressContributionCap: form.stressContributionCap
			? toCents(form.stressContributionCap)
			: null,
		stressIncomeLossMonths: Number(form.stressIncomeLossMonths),
		stressPlanCostPct: Number(form.stressPlanCostPct),
		plannerModelId: current.plannerModelId,
	};
}

export function SettingsDialog({
	open,
	onOpenChange,
	settings,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	settings: PlanningSettingsInput;
}) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [form, setForm] = useState<SettingsForm>(() => toForm(settings));

	useEffect(() => {
		if (open) {
			setForm(toForm(settings));
		}
	}, [open, settings]);

	const patch = (next: Partial<SettingsForm>) =>
		setForm((current) => ({ ...current, ...next }));

	const handleSave = () => {
		const input = toSettings(form, settings);

		startTransition(async () => {
			const result = await savePlanningSettingsAction(input);

			if (result.success) {
				toast.success(result.message);
				onOpenChange(false);
				router.refresh();
				return;
			}

			toast.error(result.error);
		});
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Ajustes do planejamento</DialogTitle>
					<DialogDescription>
						Premissas da projeção e os cenários de estresse.
					</DialogDescription>
				</DialogHeader>
				<div className="grid gap-4 sm:grid-cols-2">
					<div className="space-y-2 sm:col-span-2">
						<Label htmlFor="settings-planned-contribution">
							Aporte mensal planejado
						</Label>
						<CurrencyInput
							id="settings-planned-contribution"
							placeholder="R$ 0,00"
							value={form.plannedContribution}
							onValueChange={(plannedContribution) =>
								patch({ plannedContribution })
							}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="settings-reserve-months">Meses de reserva</Label>
						<Input
							id="settings-reserve-months"
							type="number"
							min={0}
							max={24}
							value={form.reserveMonths}
							onChange={(event) => patch({ reserveMonths: event.target.value })}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="settings-baseline-months">
							Meses da linha de base
						</Label>
						<Input
							id="settings-baseline-months"
							type="number"
							min={3}
							max={24}
							value={form.baselineMonths}
							onChange={(event) =>
								patch({ baselineMonths: event.target.value })
							}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="settings-ipca">Previsão IPCA (% a.a.)</Label>
						<Input
							id="settings-ipca"
							type="number"
							step="0.1"
							value={form.ipca}
							onChange={(event) => patch({ ipca: event.target.value })}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="settings-incc">Previsão INCC (% a.a.)</Label>
						<Input
							id="settings-incc"
							type="number"
							step="0.1"
							value={form.incc}
							onChange={(event) => patch({ incc: event.target.value })}
						/>
					</div>
					<div className="space-y-2 sm:col-span-2">
						<Label htmlFor="settings-horizon-end">
							Fim do horizonte (opcional)
						</Label>
						<Input
							id="settings-horizon-end"
							type="month"
							value={form.horizonEnd}
							onChange={(event) => patch({ horizonEnd: event.target.value })}
						/>
					</div>
					<div className="space-y-2 sm:col-span-2">
						<Label htmlFor="settings-stress-cap">
							Teto de aporte no estresse (opcional)
						</Label>
						<CurrencyInput
							id="settings-stress-cap"
							placeholder="R$ 0,00"
							value={form.stressContributionCap}
							onValueChange={(stressContributionCap) =>
								patch({ stressContributionCap })
							}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="settings-stress-income">
							Meses sem renda no estresse
						</Label>
						<Input
							id="settings-stress-income"
							type="number"
							min={0}
							max={24}
							value={form.stressIncomeLossMonths}
							onChange={(event) =>
								patch({ stressIncomeLossMonths: event.target.value })
							}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="settings-stress-plan-cost">
							Alta de custo dos planos (%)
						</Label>
						<Input
							id="settings-stress-plan-cost"
							type="number"
							min={0}
							max={100}
							step="0.1"
							value={form.stressPlanCostPct}
							onChange={(event) =>
								patch({ stressPlanCostPct: event.target.value })
							}
						/>
					</div>
				</div>
				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={isPending}
					>
						Cancelar
					</Button>
					<Button type="button" onClick={handleSave} disabled={isPending}>
						{isPending ? "Salvando..." : "Salvar"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
