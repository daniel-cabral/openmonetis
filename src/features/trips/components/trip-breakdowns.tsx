import type {
	TripBreakdownItem,
	TripSummary,
} from "@/features/trips/lib/summary";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/shared/components/ui/card";
import { formatCurrency } from "@/shared/utils/currency";

function BreakdownCard({
	title,
	items,
}: {
	title: string;
	items: TripBreakdownItem[];
}) {
	return (
		<Card>
			<CardHeader className="pb-2">
				<CardTitle className="text-sm font-medium">{title}</CardTitle>
			</CardHeader>
			<CardContent>
				{items.length === 0 ? (
					<p className="text-sm text-muted-foreground">Nada por aqui ainda.</p>
				) : (
					<ul className="space-y-1">
						{items.map((item) => (
							<li
								key={item.label}
								className="flex justify-between gap-2 text-sm"
							>
								<span className="truncate">{item.label}</span>
								<span className="tabular-nums">
									{formatCurrency(item.amount)}
								</span>
							</li>
						))}
					</ul>
				)}
			</CardContent>
		</Card>
	);
}

export function TripBreakdowns({ summary }: { summary: TripSummary }) {
	return (
		<div className="grid gap-4 md:grid-cols-3">
			<BreakdownCard title="Por categoria" items={summary.byCategory} />
			<BreakdownCard title="Por cartão ou conta" items={summary.bySource} />
			<BreakdownCard title="Por pessoa" items={summary.byPayer} />
		</div>
	);
}
