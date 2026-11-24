"use client";

import { useState } from "react";
import {
	type ContributionAssignment,
	defaultAssignment,
	type PositionLineDraft,
	prefillPositionLines,
} from "@/features/planning/lib/check-in";
import type {
	InvestmentAccountView,
	PlanningSnapshot,
} from "@/features/planning/lib/snapshot-types";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/shared/components/ui/dialog";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@/shared/components/ui/tabs";
import { BalancesStep } from "./balances-step";
import { BidsStep } from "./bids-step";
import { ContributionsStep } from "./contributions-step";

function buildDrafts(
	accounts: InvestmentAccountView[],
	assignments: ContributionAssignment[],
): Record<string, PositionLineDraft[]> {
	return Object.fromEntries(
		accounts.map((account) => [
			account.id,
			prefillPositionLines(account.positions, assignments, account.id),
		]),
	);
}

/** Mounted only while open, so every check-in starts from the current snapshot. */
export function CheckInDialog({
	snapshot,
	today,
	onOpenChange,
}: {
	snapshot: PlanningSnapshot;
	today: string;
	onOpenChange: (open: boolean) => void;
}) {
	const [assignments, setAssignments] = useState<ContributionAssignment[]>(() =>
		snapshot.currentMonthContributions.map((row) =>
			defaultAssignment(row, snapshot.accounts[0]?.id ?? ""),
		),
	);
	const [drafts, setDrafts] = useState(() =>
		buildDrafts(snapshot.accounts, assignments),
	);
	const bidPlans = snapshot.plans.filter(
		(plan) => plan.type === "consorcio" && plan.lifecycle === "active",
	);

	const changeAssignment = (index: number, next: ContributionAssignment) => {
		const nextAssignments = assignments.map((item, i) =>
			i === index ? next : item,
		);
		setAssignments(nextAssignments);
		setDrafts(buildDrafts(snapshot.accounts, nextAssignments));
	};

	return (
		<Dialog open onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
				<DialogHeader>
					<DialogTitle>Check-in mensal</DialogTitle>
					<DialogDescription>
						Registre os aportes do mês, os saldos das contas e o lance vencedor.
					</DialogDescription>
				</DialogHeader>
				<Tabs defaultValue="contributions">
					<TabsList className="w-full">
						<TabsTrigger value="contributions">Aportes do mês</TabsTrigger>
						<TabsTrigger value="balances">Saldos por conta</TabsTrigger>
						<TabsTrigger value="bids">Lance vencedor</TabsTrigger>
					</TabsList>
					<TabsContent value="contributions">
						<ContributionsStep
							rows={snapshot.currentMonthContributions}
							accounts={snapshot.accounts}
							assignments={assignments}
							onChange={changeAssignment}
						/>
					</TabsContent>
					<TabsContent value="balances">
						<BalancesStep
							accounts={snapshot.accounts}
							today={today}
							drafts={drafts}
							onDraftsChange={setDrafts}
						/>
					</TabsContent>
					<TabsContent value="bids">
						<BidsStep plans={bidPlans} month={snapshot.currentMonth} />
					</TabsContent>
				</Tabs>
			</DialogContent>
		</Dialog>
	);
}
