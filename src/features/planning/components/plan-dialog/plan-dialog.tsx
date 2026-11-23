"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
	createPlanAction,
	updatePlanAction,
} from "@/features/planning/actions";
import type { Period } from "@/features/planning/lib/engine";
import {
	emptyPlanForm,
	formToPlanInput,
	type PlanFormValues,
	planToForm,
} from "@/features/planning/lib/plan-form";
import type {
	InvestmentAccountView,
	PlanView,
} from "@/features/planning/lib/snapshot-types";
import { Button } from "@/shared/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/shared/components/ui/dialog";
import { CommonFields } from "./common-fields";
import { GoalFields } from "./goal-fields";

type PlanDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	type: "goal" | "consorcio";
	plan?: PlanView;
	potAccounts: InvestmentAccountView[];
	currentMonth: Period;
};

export function PlanDialog({
	open,
	onOpenChange,
	type,
	plan,
	potAccounts,
	currentMonth,
}: PlanDialogProps) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [values, setValues] = useState<PlanFormValues>(() =>
		plan ? planToForm(plan) : emptyPlanForm(type, currentMonth),
	);

	useEffect(() => {
		if (open) {
			setValues(plan ? planToForm(plan) : emptyPlanForm(type, currentMonth));
		}
	}, [open, plan, type, currentMonth]);

	const patch = (next: Partial<PlanFormValues>) =>
		setValues((current) => ({ ...current, ...next }));

	const handleSave = () => {
		const input = formToPlanInput(values);

		startTransition(async () => {
			const result = plan
				? await updatePlanAction({ ...input, id: plan.id })
				: await createPlanAction(input);

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
					<DialogTitle>{plan ? "Editar plano" : "Novo plano"}</DialogTitle>
					<DialogDescription>
						Defina o valor, o mês alvo e os potes que podem pagar.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-6">
					<CommonFields
						values={values}
						patch={patch}
						potAccounts={potAccounts}
					/>
					{values.type === "goal" ? (
						<GoalFields values={values} patch={patch} />
					) : null}
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
