"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { linkTransactionsToTripAction } from "@/features/trips/actions";
import type { TripTransactionRow } from "@/features/trips/lib/summary";
import { Button } from "@/shared/components/ui/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/shared/components/ui/card";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { formatCurrency } from "@/shared/utils/currency";
import { formatDateOnly } from "@/shared/utils/date";

const installmentLabel = (row: TripTransactionRow) =>
	row.currentInstallment && row.installmentCount
		? ` (${row.currentInstallment}/${row.installmentCount})`
		: "";

export function TripSuggestions({
	tripId,
	rows,
}: {
	tripId: string;
	rows: TripTransactionRow[];
}) {
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [isPending, startTransition] = useTransition();

	const toggle = (id: string, checked: boolean) =>
		setSelected((prev) => {
			const next = new Set(prev);
			if (checked) next.add(id);
			else next.delete(id);
			return next;
		});

	const linkSelected = () =>
		startTransition(async () => {
			const result = await linkTransactionsToTripAction({
				tripId,
				transactionIds: [...selected],
			});
			if (!result.success) {
				toast.error(result.error);
				return;
			}
			toast.success(result.message);
			setSelected(new Set());
		});

	return (
		<Card>
			<CardHeader className="pb-2">
				<CardTitle className="text-sm font-medium">Sugestões</CardTitle>
				<p className="text-xs text-muted-foreground">
					Lançamentos sem viagem com data da compra no período.
				</p>
			</CardHeader>
			<CardContent className="space-y-3">
				{rows.length === 0 ? (
					<p className="text-sm text-muted-foreground">Nenhuma sugestão.</p>
				) : (
					<ul className="space-y-2">
						{rows.map((row) => (
							<li key={row.id} className="flex items-start gap-2 text-sm">
								<Checkbox
									id={`suggestion-${row.id}`}
									checked={selected.has(row.id)}
									onCheckedChange={(checked) =>
										toggle(row.id, checked === true)
									}
								/>
								<label
									htmlFor={`suggestion-${row.id}`}
									className="min-w-0 flex-1"
								>
									<span className="block truncate">
										{row.name}
										{installmentLabel(row)}
									</span>
									<span className="text-xs text-muted-foreground">
										{formatDateOnly(row.purchaseDate)} ·{" "}
										{formatCurrency(row.amount)}
									</span>
								</label>
							</li>
						))}
					</ul>
				)}
				<Button
					className="w-full"
					size="sm"
					disabled={selected.size === 0 || isPending}
					onClick={linkSelected}
				>
					Vincular selecionados
				</Button>
			</CardContent>
		</Card>
	);
}
