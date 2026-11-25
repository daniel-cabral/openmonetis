"use client";

import {
	RiAddLine,
	RiCheckboxCircleLine,
	RiCompass3Line,
	RiSettings3Line,
} from "@remixicon/react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { driftMessages } from "@/features/planning/lib/drift-view";
import {
	applyStress,
	type Cents,
	detectDrift,
	type EngineInput,
	type Projection,
	runProjection,
	type StressToggles,
	stressEffects,
} from "@/features/planning/lib/engine";
import type { StoredConversation } from "@/features/planning/lib/planner/conversation-store";
import { buildDriftDiagnosis } from "@/features/planning/lib/planner/drift-diagnosis";
import {
	applyChangesToInput,
	type ProposalChange,
	ProposalError,
} from "@/features/planning/lib/planner/proposal";
import type { ProposalToolOutput } from "@/features/planning/lib/planner/tools";
import type { PlanningSettingsInput } from "@/features/planning/lib/schemas";
import type {
	PlanningSnapshot,
	PlanView,
} from "@/features/planning/lib/snapshot-types";
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
import {
	type ModelGroup,
	pickAvailableModel,
} from "@/shared/lib/ai/model-groups";
import { DEFAULT_MODEL } from "@/shared/lib/ai/models";
import { MONTH_NAMES, parsePeriod } from "@/shared/utils/period";
import { AssumptionLogCard } from "./assumption-log-card";
import { CheckInDialog } from "./check-in/check-in-dialog";
import { DriftBanner } from "./drift-banner";
import { KpiRow } from "./kpi-row";
import { LiquidityChart } from "./liquidity-chart";
import { PlanDialog } from "./plan-dialog/plan-dialog";
import { PlannerPanel } from "./planner/planner-panel";
import { ProposalCard } from "./planner/proposal-card";
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

/** The input with a proposal applied, or null when it no longer fits the current plans. */
function previewInput(
	input: EngineInput,
	changes: ProposalChange[],
	plannedContribution: Cents,
): EngineInput | null {
	try {
		return applyChangesToInput(input, changes, { plannedContribution });
	} catch (error) {
		if (error instanceof ProposalError) return null;
		throw error;
	}
}

export function PlanningPage({
	snapshot,
	today,
	expenseCategories,
	plannerConversation,
	modelGroups,
}: {
	snapshot: PlanningSnapshot;
	today: string;
	expenseCategories: { id: string; name: string }[];
	plannerConversation: StoredConversation | null;
	modelGroups: ModelGroup[];
}) {
	const [activeStress, setActiveStress] = useState<StressToggles>({});
	const [preview, setPreview] = useState<{
		proposalId: string;
		changes: ProposalChange[];
	} | null>(null);
	const [prefill, setPrefill] = useState<string | null>(null);
	const configured = useMemo(
		() => configuredStress(snapshot.settings),
		[snapshot.settings],
	);

	const { kpis, chart, rows, drift, driftSignals, effects, previewedId } =
		useMemo(() => {
			const todayDate = new Date(`${today}T00:00:00`);
			// Drift reflects the saved plan: health and reserve floor both come from
			// this unstressed, unpreviewed projection.
			const baseProjection: Projection = runProjection(snapshot.input);
			const previewed =
				preview &&
				!snapshot.assumptions.some((a) => a.proposalId === preview.proposalId)
					? previewInput(
							snapshot.input,
							preview.changes,
							snapshot.settings.plannedContribution,
						)
					: null;
			const projection = runProjection(
				applyStress(previewed ?? snapshot.input, activeStress),
			);
			// Plans that exist only in the preview get rows; PlansTable flags them "Novo".
			const newPlans: PlanView[] = (previewed?.plans ?? [])
				.filter(
					(plan) => !snapshot.input.plans.some((saved) => saved.id === plan.id),
				)
				.map((plan) => ({ ...plan, type: plan.fields.type, categoryIds: [] }));
			const kpis = buildKpis(snapshot, projection, todayDate);
			const driftSignals = detectDrift({
				health: baseProjection.health,
				liquidNow: kpis.liquidToday,
				reserveFloor:
					baseProjection.scenarios.base.months[0]?.reserveFloor ?? 0,
				contributionsByMonth: snapshot.contributionsByMonth,
				plannedContribution: snapshot.settings.plannedContribution,
			});
			const drift = driftMessages(
				driftSignals,
				Object.fromEntries(snapshot.plans.map((plan) => [plan.id, plan.name])),
			);
			return {
				kpis,
				chart: buildChartSeries(projection),
				rows: buildPlanRows([...snapshot.plans, ...newPlans], projection, kpis),
				drift,
				driftSignals,
				effects: stressEffects(snapshot.input, configured),
				previewedId: previewed && preview ? preview.proposalId : null,
			};
		}, [snapshot, activeStress, configured, today, preview]);

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

	const togglePreview = (output: ProposalToolOutput, toolCallId: string) => {
		if (previewedId === toolCallId) {
			setPreview(null);
			return;
		}
		if ("error" in output) return;
		if (
			!previewInput(
				snapshot.input,
				output.proposal.changes,
				snapshot.settings.plannedContribution,
			)
		) {
			toast.error("Esta proposta não se aplica aos planos atuais.");
			return;
		}
		setPreview({ proposalId: toolCallId, changes: output.proposal.changes });
	};

	const discussDrift = () =>
		setPrefill(
			buildDriftDiagnosis(
				driftSignals,
				Object.fromEntries(snapshot.plans.map((plan) => [plan.id, plan.name])),
				snapshot.currentMonth,
			),
		);

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
			<DriftBanner messages={drift} onDiscuss={discussDrift} />
			<KpiRow kpis={kpis} />
			<div className="grid gap-6 lg:grid-cols-5">
				<div className="space-y-6 lg:col-span-2">
					<PlannerPanel
						conversation={plannerConversation}
						modelId={pickAvailableModel(
							snapshot.settings.plannerModelId ?? DEFAULT_MODEL,
							modelGroups.filter((group) => group.models.length > 0),
						)}
						modelGroups={modelGroups}
						settings={snapshot.settings}
						prefill={prefill}
						onPrefillConsumed={() => setPrefill(null)}
						renderProposal={(output, toolCallId) => (
							<ProposalCard
								output={output}
								applied={snapshot.assumptions.some(
									(assumption) => assumption.proposalId === toolCallId,
								)}
								previewing={previewedId === toolCallId}
								onPreview={() => togglePreview(output, toolCallId)}
								onDiscard={() =>
									setPreview((current) =>
										current?.proposalId === toolCallId ? null : current,
									)
								}
							/>
						)}
					/>
					<StressCard
						configured={configured}
						effects={effects}
						active={activeStress}
						onToggle={toggleStress}
					/>
				</div>
				<div className="space-y-6 lg:col-span-3">
					<LiquidityChart
						points={chart}
						previewLabel={previewedId ? "Prévia" : undefined}
					/>
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
				indexForecastPct={snapshot.input.indexForecastPct}
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
