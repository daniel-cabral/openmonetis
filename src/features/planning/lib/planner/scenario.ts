import type {
	AdhocCashEvent,
	Cents,
	EngineInput,
	EnginePosition,
	LiquidityKind,
	Period,
} from "@/features/planning/lib/engine";
import { ProposalError } from "./proposal";

type ScenarioPosition = {
	accountId: string | null;
	amount: Cents;
	liquidity: LiquidityKind;
	maturityMonth: Period | null;
	annualRealReturnPct: number | null;
};

export type PlannerScenario = {
	winningBidPct?: { planId: string; pct: number }[];
	positions?: {
		add?: ScenarioPosition[];
		remove?: string[];
		edit?: {
			id: string;
			amount?: Cents;
			liquidity?: LiquidityKind;
			maturityMonth?: Period | null;
			annualRealReturnPct?: number | null;
		}[];
	};
	cashEvents?: AdhocCashEvent[];
};

const SCENARIO_ACCOUNT_ID = "scenario";

export function applyScenario(
	input: EngineInput,
	scenario: PlannerScenario,
): EngineInput {
	return {
		...input,
		plans: applyBids(input.plans, scenario.winningBidPct ?? []),
		positions: applyPositions(input.positions, scenario.positions ?? {}),
		adhocEvents: scenario.cashEvents
			? [...(input.adhocEvents ?? []), ...scenario.cashEvents]
			: input.adhocEvents,
	};
}

function applyBids(
	plans: EngineInput["plans"],
	bids: NonNullable<PlannerScenario["winningBidPct"]>,
): EngineInput["plans"] {
	return bids.reduce((current, { planId, pct }) => {
		const plan = current.find((candidate) => candidate.id === planId);
		if (!plan) {
			throw new ProposalError("Plano não encontrado.");
		}
		if (plan.fields.type !== "consorcio") {
			throw new ProposalError("O lance hipotético só vale para consórcio.");
		}
		return current.map((candidate) =>
			candidate.id === planId
				? {
						...candidate,
						bidHistory: [{ month: candidate.targetMonth, winningBidPct: pct }],
					}
				: candidate,
		);
	}, plans);
}

function applyPositions(
	positions: EnginePosition[],
	changes: NonNullable<PlannerScenario["positions"]>,
): EnginePosition[] {
	const requireKnown = (id: string) => {
		if (!positions.some((position) => position.id === id)) {
			throw new ProposalError("Posição não encontrada.");
		}
	};
	const removed = new Set(changes.remove ?? []);
	for (const id of removed) {
		requireKnown(id);
	}
	const edits = new Map((changes.edit ?? []).map((edit) => [edit.id, edit]));
	for (const id of edits.keys()) {
		requireKnown(id);
	}

	const kept = positions
		.filter((position) => !removed.has(position.id))
		.map((position) => {
			const { id: _id, ...patch } = edits.get(position.id) ?? {};
			return { ...position, ...patch };
		});
	const added = (changes.add ?? []).map(
		(position, index): EnginePosition => ({
			...position,
			id: `scenario-position-${index}`,
			accountId: position.accountId ?? SCENARIO_ACCOUNT_ID,
		}),
	);
	return [...kept, ...added];
}
