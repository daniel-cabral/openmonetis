"use client";

import type { PlanFormValues } from "@/features/planning/lib/plan-form";
import { CurrencyInput } from "@/shared/components/ui/currency-input";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
import type { PatchPlanForm } from "./common-fields";

export function GoalFields({
	values,
	patch,
}: {
	values: PlanFormValues;
	patch: PatchPlanForm;
}) {
	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between gap-3">
				<Label htmlFor="goal-has-range">Faixa de valor</Label>
				<Switch
					id="goal-has-range"
					checked={values.hasRange}
					onCheckedChange={(hasRange) => patch({ hasRange })}
				/>
			</div>

			{values.hasRange ? (
				<div className="grid gap-4 sm:grid-cols-3">
					<div className="space-y-2">
						<Label htmlFor="goal-target-min">Mínimo</Label>
						<CurrencyInput
							id="goal-target-min"
							value={values.targetMin}
							onValueChange={(targetMin) => patch({ targetMin })}
							placeholder="R$ 0,00"
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="goal-target-base">Base</Label>
						<CurrencyInput
							id="goal-target-base"
							value={values.targetBase}
							onValueChange={(targetBase) => patch({ targetBase })}
							placeholder="R$ 0,00"
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="goal-target-max">Máximo</Label>
						<CurrencyInput
							id="goal-target-max"
							value={values.targetMax}
							onValueChange={(targetMax) => patch({ targetMax })}
							placeholder="R$ 0,00"
						/>
					</div>
				</div>
			) : (
				<div className="space-y-2">
					<Label htmlFor="goal-target">Valor alvo</Label>
					<CurrencyInput
						id="goal-target"
						value={values.targetBase}
						onValueChange={(targetBase) => patch({ targetBase })}
						placeholder="R$ 0,00"
					/>
				</div>
			)}
		</div>
	);
}
