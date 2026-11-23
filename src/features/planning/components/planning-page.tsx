"use client";

import {
	RiAddLine,
	RiCheckboxCircleLine,
	RiCompass3Line,
	RiSettings3Line,
} from "@remixicon/react";
import { useMemo, useState } from "react";
import { driftMessages } from "@/features/planning/lib/drift-view";
import {
	applyStress,
	detectDrift,
	type Projection,
	runProjection,
	type StressToggles,
	stressEffects,
} from "@/features/planning/lib/engine";
import type { PlanningSettingsInput } from "@/features/planning/lib/schemas";
import type { PlanningSnapshot } from "@/features/planning/lib/snapshot-types";
import {
	buildChartSeries,
	buildKpis,
	buildPlanRows,
} from "@/features/planning/lib/view-model";
import PageDescription from "@/shared/components/page-description";
import { Button } from "@/shared/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { MONTH_NAMES, parsePeriod } from "@/shared/utils/period";
import { AssumptionLogCard } from "./assumption-log-card";
import { CheckInDialog } from "./check-in/check-in-dialog";
import { DriftBanner } from "./drift-banner";
import { KpiRow } from "./kpi-row";
import { LiquidityChart } from "./liquidity-chart";
import { PlanDialog } from "./plan-dialog/plan-dialog";
import { PlannerPlaceholder } from "./planner-placeholder";
import { PlansTable } from "./plans-table";
import { SettingsDialog } from "./settings-dialog";
import { StressCard } from "./stress-card";

/** Stress scenarios the user can toggle, built from the saved settings. */
function configuredStress(settings: PlanningSettingsInput): StressToggles {
	return {
		...(settings.stressContributionCap !== null
			? { contributionCap: settings.stressContributionCap }
			: {}),
		...(settings.stressIncomeLossMonths > 0
			? { incomeLossMonths: settings.stressIncomeLossMonths }
			: {}),
		bidAtRangeMax: true,
		...(settings.stressPlanCostPct > 0
			? { planCostPct: settings.stressPlanCostPct }
			: {}),
	};
}

export function PlanningPage({
	snapshot,
	today,
	expenseCategories,
}: {
	snapshot: PlanningSnapshot;
	today: string;
	expenseCategories: { id: string; name: string }[];
}) {
	const [activeStress, setActiveStress] = useState<StressToggles>({});
	const configured = useMemo(
		() => configuredStress(snapshot.settings),
		[snapshot.settings],
	);

	const { kpis, chart, rows, drift, effects } = useMemo(() => {
		const todayDate = new Date(`${today}T00:00:00`);
		// Drift reflects the real plan, so it reads the unstressed projection.
		const baseProjection: Projection = runProjection(snapshot.input);
		const projection = runProjection(applyStress(snapshot.input, activeStress));
		const kpis = buildKpis(snapshot, projection, todayDate);
		const drift = driftMessages(
			detectDrift({
				health: baseProjection.health,
				liquidNow: kpis.liquidToday,
				reserveFloor: kpis.reserveFloor,
				contributionsByMonth: snapshot.contributionsByMonth,
				plannedContribution: snapshot.settings.plannedContribution,
			}),
			Object.fromEntries(snapshot.plans.map((plan) => [plan.id, plan.name])),
		);
		return {
			kpis,
			chart: buildChartSeries(projection),
			rows: buildPlanRows(snapshot.plans, projection, kpis),
			drift,
			effects: stressEffects(snapshot.input, configured),
		};
	}, [snapshot, activeStress, configured, today]);

	const [dialogOpen, setDialogOpen] = useState(false);
	const [newPlanType, setNewPlanType] = useState<"goal" | "consorcio">("goal");
	const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
	const [checkInOpen, setCheckInOpen] = useState(false);
	const [settingsOpen, setSettingsOpen] = useState(false);
	const editingPlan = snapshot.plans.find((plan) => plan.id === editingPlanId);
	const potAccounts = snapshot.accounts.filter(
		(account) => account.isEarmarkedPot,
	);
	const checkInMonth =
		MONTH_NAMES[parsePeriod(snapshot.currentMonth).month - 1] ?? "";

	const openNewPlan = (type: "goal" | "consorcio") => {
		setNewPlanType(type);
		setEditingPlanId(null);
		setDialogOpen(true);
	};

	const openEditPlan = (planId: string) => {
		setEditingPlanId(planId);
		setDialogOpen(true);
	};

	const toggleStress = (toggle: keyof StressToggles, enabled: boolean) => {
		setActiveStress((current) => {
			const next: StressToggles = { ...current };
			if (enabled) {
				Object.assign(next, { [toggle]: configured[toggle] });
			} else {
				delete next[toggle];
			}
			return next;
		});
	};

	return (
		<section className="space-y-6">
			<PageDescription
				icon={<RiCompass3Line />}
				title="Planejamento"
				subtitle="Acompanhe a liquidez, as metas e os planos futuros."
			/>
			<DriftBanner messages={drift} />
			<KpiRow kpis={kpis} />
			<div className="grid gap-6 lg:grid-cols-5">
				<div className="space-y-6 lg:col-span-2">
					<PlannerPlaceholder />
					<StressCard
						configured={configured}
						effects={effects}
						active={activeStress}
						onToggle={toggleStress}
					/>
				</div>
				<div className="space-y-6 lg:col-span-3">
					<LiquidityChart points={chart} />
					<div className="flex flex-wrap justify-end gap-2">
						<Button
							type="button"
							variant="outline"
							onClick={() => setSettingsOpen(true)}
						>
							<RiSettings3Line className="size-4" />
							Ajustes
						</Button>
						<Button
							type="button"
							variant="outline"
							onClick={() => setCheckInOpen(true)}
						>
							<RiCheckboxCircleLine className="size-4" />
							Check-in de {checkInMonth}
						</Button>
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button type="button">
									<RiAddLine className="size-4" />
									Novo plano
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								<DropdownMenuItem onSelect={() => openNewPlan("goal")}>
									Objetivo
								</DropdownMenuItem>
								<DropdownMenuItem onSelect={() => openNewPlan("consorcio")}>
									Consórcio
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
					<PlansTable
						rows={rows}
						plans={snapshot.plans}
						onEdit={openEditPlan}
					/>
					<AssumptionLogCard assumptions={snapshot.assumptions} />
				</div>
			</div>
			<PlanDialog
				open={dialogOpen}
				onOpenChange={setDialogOpen}
				type={editingPlan?.type ?? newPlanType}
				plan={editingPlan}
				potAccounts={potAccounts}
				currentMonth={snapshot.currentMonth}
				inccForecastPct={snapshot.input.indexForecastPct.INCC}
				expenseCategories={expenseCategories}
			/>
			{checkInOpen ? (
				<CheckInDialog
					snapshot={snapshot}
					today={today}
					onOpenChange={setCheckInOpen}
				/>
			) : null}
			<SettingsDialog
				open={settingsOpen}
				onOpenChange={setSettingsOpen}
				settings={snapshot.settings}
			/>
		</section>
	);
}
