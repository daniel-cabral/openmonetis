"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { unlinkTransactionsFromTripAction } from "@/features/trips/actions";
import type { TripTransactionRow } from "@/features/trips/lib/summary";
import { Button } from "@/shared/components/ui/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/shared/components/ui/card";
import { formatCurrency } from "@/shared/utils/currency";
import { formatDateOnly } from "@/shared/utils/date";

const installmentLabel = (row: TripTransactionRow) =>
	row.currentInstallment && row.installmentCount
		? ` (${row.currentInstallment}/${row.installmentCount})`
		: "";

export function TripTransactionsList({ rows }: { rows: TripTransactionRow[] }) {
	const [isPending, startTransition] = useTransition();

	const unlink = (id: string) =>
		startTransition(async () => {
			const result = await unlinkTransactionsFromTripAction({
				transactionIds: [id],
			});
			if (result.success) toast.success(result.message);
			else toast.error(result.error);
		});

	return (
		<Card>
			<CardHeader className="pb-2">
				<CardTitle className="text-sm font-medium">
					Lançamentos da viagem
				</CardTitle>
			</CardHeader>
			<CardContent>
				{rows.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						Nenhum lançamento vinculado. Use as sugestões ou o campo Viagem no
						lançamento.
					</p>
				) : (
					<ul className="divide-y">
						{rows.map((row) => (
							<li
								key={row.id}
								className="flex items-center justify-between gap-2 py-2 text-sm"
							>
								<div className="min-w-0">
									<p className="truncate">
										{row.name}
										{installmentLabel(row)}
									</p>
									<p className="text-xs text-muted-foreground">
										{formatDateOnly(row.purchaseDate)} ·{" "}
										{row.payerName ?? "Sem pessoa"}
									</p>
								</div>
								<div className="flex items-center gap-2">
									<span className="tabular-nums">
										{formatCurrency(row.amount)}
									</span>
									<Button
										variant="ghost"
										size="sm"
										disabled={isPending}
										onClick={() => unlink(row.id)}
									>
										Desvincular
									</Button>
								</div>
							</li>
						))}
					</ul>
				)}
			</CardContent>
		</Card>
	);
}
