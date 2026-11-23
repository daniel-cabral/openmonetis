"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { recordWinningBidAction } from "@/features/planning/actions";
import type { Period } from "@/features/planning/lib/engine";
import type { PlanView } from "@/features/planning/lib/snapshot-types";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";

export function BidsStep({
	plans,
	month,
}: {
	plans: PlanView[];
	month: Period;
}) {
	if (plans.length === 0) {
		return (
			<p className="text-sm text-muted-foreground">
				Nenhum consórcio ativo para registrar lance.
			</p>
		);
	}

	return (
		<div className="space-y-4">
			{plans.map((plan) => (
				<BidRow key={plan.id} plan={plan} month={month} />
			))}
		</div>
	);
}

function BidRow({ plan, month }: { plan: PlanView; month: Period }) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [value, setValue] = useState("");

	const handleSave = () => {
		startTransition(async () => {
			const result = await recordWinningBidAction({
				planId: plan.id,
				month,
				winningBidPct: Number(value),
			});

			if (result.success) {
				toast.success(result.message);
				setValue("");
				router.refresh();
				return;
			}

			toast.error(result.error);
		});
	};

	return (
		<div className="flex flex-wrap items-end gap-3">
			<div className="min-w-0 flex-1 space-y-2">
				<Label htmlFor={`bid-${plan.id}`}>{plan.name}</Label>
				<Input
					id={`bid-${plan.id}`}
					type="number"
					inputMode="decimal"
					step="0.01"
					min={0}
					max={100}
					placeholder="% do lance vencedor"
					value={value}
					onChange={(event) => setValue(event.target.value)}
				/>
			</div>
			<Button
				type="button"
				disabled={isPending || value === ""}
				onClick={handleSave}
			>
				Salvar lance
			</Button>
		</div>
	);
}
