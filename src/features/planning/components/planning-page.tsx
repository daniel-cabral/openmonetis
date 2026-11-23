"use client";

import { RiAddLine, RiCompass3Line } from "@remixicon/react";
import { useMemo, useState } from "react";
import { runProjection } from "@/features/planning/lib/engine";
import type { PlanningSnapshot } from "@/features/planning/lib/snapshot-types";
import {
	buildChartSeries,
	buildKpis,
	buildPlanRows,
} from "@/features/planning/lib/view-model";
import PageDescription from "@/shared/components/page-description";
import { Button } from "@/shared/components/ui/button";
import { KpiRow } from "./kpi-row";
import { LiquidityChart } from "./liquidity-chart";
import { PlanDialog } from "./plan-dialog/plan-dialog";
import { PlannerPlaceholder } from "./planner-placeholder";
import { PlansTable } from "./plans-table";

export function PlanningPage({
	snapshot,
	today,
}: {
	snapshot: PlanningSnapshot;
	today: string;
}) {
	const { kpis, chart, rows } = useMemo(() => {
		const projection = runProjection(snapshot.input);
		const kpis = buildKpis(
			snapshot,
			projection,
			new Date(`${today}T00:00:00`),
		);
		return {
			kpis,
			chart: buildChartSeries(projection),
			rows: buildPlanRows(snapshot.plans, projection, kpis),
		};
	}, [snapshot, today]);

	const [dialogOpen, setDialogOpen] = useState(false);
	const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
	const editingPlan = snapshot.plans.find((plan) => plan.id === editingPlanId);
	const potAccounts = snapshot.accounts.filter(
		(account) => account.isEarmarkedPot,
	);

	const openPlanDialog = (planId: string | null) => {
		setEditingPlanId(planId);
		setDialogOpen(true);
	};

	return (
		<section className="space-y-6">
			<PageDescription
				icon={<RiCompass3Line />}
				title="Planejamento"
				subtitle="Acompanhe a liquidez, as metas e os planos futuros."
			/>
			<KpiRow kpis={kpis} />
			<div className="grid gap-6 lg:grid-cols-5">
				<div className="lg:col-span-2">
					<PlannerPlaceholder />
				</div>
				<div className="space-y-6 lg:col-span-3">
					<LiquidityChart points={chart} />
					<div className="flex justify-end">
						<Button type="button" onClick={() => openPlanDialog(null)}>
							<RiAddLine className="size-4" />
							Novo plano
						</Button>
					</div>
					<PlansTable
						rows={rows}
						plans={snapshot.plans}
						onEdit={(planId) => openPlanDialog(planId)}
					/>
				</div>
			</div>
			<PlanDialog
				open={dialogOpen}
				onOpenChange={setDialogOpen}
				type="goal"
				plan={editingPlan}
				potAccounts={potAccounts}
				currentMonth={snapshot.currentMonth}
				inccForecastPct={snapshot.input.indexForecastPct.INCC}
			/>
		</section>
	);
}
