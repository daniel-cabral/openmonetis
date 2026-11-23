"use client";

import { RiCompass3Line } from "@remixicon/react";
import type { PlanningSnapshot } from "@/features/planning/lib/snapshot-types";
import PageDescription from "@/shared/components/page-description";
import { PlannerPlaceholder } from "./planner-placeholder";

export function PlanningPage({ snapshot }: { snapshot: PlanningSnapshot }) {
	return (
		<section className="space-y-6">
			<PageDescription
				icon={<RiCompass3Line />}
				title="Planejamento"
				subtitle="Acompanhe a liquidez, as metas e os planos futuros."
			/>
			<div className="grid gap-6 lg:grid-cols-5">
				<div className="lg:col-span-2">
					<PlannerPlaceholder />
				</div>
				<div className="space-y-6 lg:col-span-3" />
			</div>
		</section>
	);
}
