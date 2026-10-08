import type { TripSummary } from "@/features/trips/lib/summary";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/shared/components/ui/card";
import { formatCurrency } from "@/shared/utils/currency";

export function TripSummaryCards({ summary }: { summary: TripSummary }) {
	const cards = [
		{ label: "Custo líquido", value: summary.netCost, emphasis: true },
		{ label: "Despesas", value: summary.expenses, emphasis: false },
		{ label: "Reembolsos", value: summary.reimbursements, emphasis: false },
	];
	return (
		<div className="grid gap-4 sm:grid-cols-3">
			{cards.map((card) => (
				<Card key={card.label}>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">
							{card.label}
						</CardTitle>
					</CardHeader>
					<CardContent>
						<span
							className={card.emphasis ? "text-2xl font-semibold" : "text-xl"}
						>
							{formatCurrency(card.value)}
						</span>
					</CardContent>
				</Card>
			))}
		</div>
	);
}
