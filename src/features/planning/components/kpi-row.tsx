import { formatCents } from "@/features/planning/lib/cents";
import type { PlanningKpis } from "@/features/planning/lib/view-model";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/shared/components/ui/card";
import { formatShortPeriodLabel } from "@/shared/utils/period";
import { cn } from "@/shared/utils/ui";

function KpiCard({
	title,
	value,
	detail,
	warning = false,
}: {
	title: string;
	value: string;
	detail?: string;
	warning?: boolean;
}) {
	return (
		<Card>
			<CardHeader>
				<CardDescription>{title}</CardDescription>
				<CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
			</CardHeader>
			{detail ? (
				<CardContent>
					<p
						className={cn(
							"text-xs",
							warning ? "text-warning" : "text-muted-foreground",
						)}
					>
						{detail}
					</p>
				</CardContent>
			) : null}
		</Card>
	);
}

export function KpiRow({ kpis }: { kpis: PlanningKpis }) {
	const { stalestDays, firstUnfunded } = kpis;

	return (
		<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
			<KpiCard
				title="Patrimônio total"
				value={formatCents(kpis.totalPatrimony)}
				detail={
					stalestDays === null
						? "Sem dados"
						: `atualizado há ${stalestDays} ${stalestDays === 1 ? "dia" : "dias"}`
				}
				warning={kpis.isStale}
			/>
			<KpiCard title="Liquidez hoje" value={formatCents(kpis.liquidToday)} />
			<KpiCard title="Piso da reserva" value={formatCents(kpis.reserveFloor)} />
			<KpiCard
				title="Primeiro mês descoberto"
				value={
					firstUnfunded ? formatShortPeriodLabel(firstUnfunded.month) : "—"
				}
				detail={
					firstUnfunded
						? `${firstUnfunded.planName} cede`
						: "Sem furo no horizonte"
				}
			/>
		</div>
	);
}
