"use client";

import { RiCompass3Line } from "@remixicon/react";
import { useMemo } from "react";
import { runProjection } from "@/features/planning/lib/engine";
import type { PlanningSnapshot } from "@/features/planning/lib/snapshot-types";
import {
	buildChartSeries,
	buildKpis,
	buildPlanRows,
} from "@/features/planning/lib/view-model";
import PageDescription from "@/shared/components/page-description";
import { KpiRow } from "./kpi-row";
import { LiquidityChart } from "./liquidity-chart";
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
					<PlansTable rows={rows} />
				</div>
			</div>
		</section>
	);
}
