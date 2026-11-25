import { formatCents } from "@/features/planning/lib/cents";
import type {
	AmountRange,
	EnginePlan,
	PlanTypeFields,
	PriceIndex,
} from "@/features/planning/lib/engine";
import type { PlanInput } from "@/features/planning/lib/schemas";
import { formatShortPeriodLabel } from "@/shared/utils/period";
import type { ProposalChange } from "./proposal";

/** Current state the proposal is compared against (server side, before the change). */
export type ChangeBaseline = {
	plans: EnginePlan[];
	reserveMonths: number;
	indexForecastPct: Record<PriceIndex, number>;
};

export type ChangeDescription = { title: string; lines: string[] };

type Row = [label: string, value: string];

const LIFECYCLE_LABEL: Record<PlanInput["lifecycle"], string> = {
	draft: "Rascunho",
	active: "Ativo",
	paused: "Pausado",
	done: "Concluído",
	abandoned: "Abandonado",
};
const BASIS_LABEL: Record<PlanInput["basis"], string> = {
	today: "Valores de hoje",
	nominal: "Valores nominais",
};
const BID_BASE_LABEL = {
	letter: "Carta",
	outstanding: "Saldo devedor",
	both: "Carta e saldo",
} as const;
const POST_BID_LABEL = {
	"reduce-installment": "Reduzir a parcela",
	"reduce-term": "Reduzir o prazo",
} as const;
const DIRECTION_LABEL = { outflow: "Saída", inflow: "Entrada" } as const;

const yesNo = (value: boolean) => (value ? "Sim" : "Não");

const rangeRows = (prefix: string, range: AmountRange): Row[] => [
	[`${prefix} (mín)`, formatCents(range.min)],
	[`${prefix} (base)`, formatCents(range.base)],
	[`${prefix} (máx)`, formatCents(range.max)],
];

function typeFieldRows(fields: PlanTypeFields): Row[] {
	if (fields.type === "goal") {
		return rangeRows("Meta", fields.target);
	}
	return [
		["Valor da carta", formatCents(fields.letterValue)],
		["Saldo devedor", formatCents(fields.outstandingBalance)],
		["Base do lance", BID_BASE_LABEL[fields.bidBase]],
		["Margem do lance (p.p.)", String(fields.marginPp)],
		[
			"Lance embutido",
			fields.embeddedBid.enabled ? `${fields.embeddedBid.pct}%` : "Desligado",
		],
		...(fields.monthlyInstallment
			? ([
					["Parcela mensal (hoje)", formatCents(fields.monthlyInstallment)],
					[
						"Última parcela",
						fields.lastInstallmentMonth
							? formatShortPeriodLabel(fields.lastInstallmentMonth)
							: "Não informada",
					],
					[
						"Após o lance",
						POST_BID_LABEL[fields.postBidMode ?? "reduce-installment"],
					],
				] satisfies Row[])
			: []),
	];
}

function planRows(plan: Partial<PlanInput>): Row[] {
	const rows: (Row | null)[] = [
		plan.name === undefined ? null : ["Nome", plan.name],
		plan.nonNegotiable === undefined
			? null
			: ["Inegociável", yesNo(plan.nonNegotiable)],
		plan.lifecycle === undefined
			? null
			: ["Situação", LIFECYCLE_LABEL[plan.lifecycle]],
		plan.basis === undefined
			? null
			: ["Base de valores", BASIS_LABEL[plan.basis]],
		plan.index === undefined ? null : ["Índice", plan.index],
		plan.targetMonth === undefined
			? null
			: ["Mês alvo", formatShortPeriodLabel(plan.targetMonth)],
		plan.window === undefined
			? null
			: [
					"Janela",
					plan.window
						? `${formatShortPeriodLabel(plan.window.earliest)} a ${formatShortPeriodLabel(plan.window.latest)}`
						: "Sem janela",
				],
		plan.potAccountIds === undefined
			? null
			: ["Potes vinculados", String(plan.potAccountIds.length)],
	];
	return [
		...rows.filter((row): row is Row => row !== null),
		...(plan.fields ? typeFieldRows(plan.fields) : []),
	];
}

type EventChange = Extract<ProposalChange, { op: "add-event" }>["event"];

function eventRows(event: EventChange): Row[] {
	return [
		["Descrição", event.label],
		["Tipo", DIRECTION_LABEL[event.direction]],
		...rangeRows("Valor", event.amount),
		["Base de valores", BASIS_LABEL[event.basis]],
		["Início", formatShortPeriodLabel(event.startMonth)],
		[
			"Fim",
			event.endMonth ? formatShortPeriodLabel(event.endMonth) : "Em aberto",
		],
	];
}

const toLine = ([label, value]: Row, previous?: string) =>
	previous === undefined
		? `${label}: ${value}`
		: `${label}: ${previous} → ${value}`;

function diffLines(next: Row[], previous: Row[]): string[] {
	const before = new Map(previous);
	return next.flatMap((row) => {
		const old = before.get(row[0]);
		return old === row[1] ? [] : [toLine(row, old)];
	});
}

export function describeChange(
	change: ProposalChange,
	baseline: ChangeBaseline,
): ChangeDescription {
	const planOf = (planId: string) =>
		baseline.plans.find((plan) => plan.id === planId);

	switch (change.op) {
		case "create-plan":
			return {
				title: `Criar plano "${change.plan.name}"`,
				lines: [
					...planRows(change.plan)
						.filter(([label]) => label !== "Nome")
						.map((row) => toLine(row)),
					...change.events.map(
						(event) =>
							`Evento: ${event.label} (${DIRECTION_LABEL[event.direction]}, ${formatCents(event.amount.base)}, ${formatShortPeriodLabel(event.startMonth)})`,
					),
				],
			};
		case "update-plan": {
			const plan = planOf(change.planId);
			return {
				title: `Alterar plano "${plan?.name ?? "existente"}"`,
				lines: diffLines(planRows(change.patch), plan ? planRows(plan) : []),
			};
		}
		case "add-event":
			return {
				title: `Adicionar evento a "${planOf(change.planId)?.name ?? "plano existente"}"`,
				lines: eventRows(change.event).map((row) => toLine(row)),
			};
		case "update-settings": {
			const { patch } = change;
			const next: Row[] = [];
			const previous: Row[] = [];
			if (patch.plannedContribution !== undefined) {
				next.push(["Aporte planejado", formatCents(patch.plannedContribution)]);
			}
			if (patch.reserveMonths !== undefined) {
				next.push(["Meses de reserva", String(patch.reserveMonths)]);
				previous.push(["Meses de reserva", String(baseline.reserveMonths)]);
			}
			for (const index of ["IPCA", "INCC"] as const) {
				const forecast = patch.indexForecastPct?.[index];
				if (forecast !== undefined) {
					const label = `Previsão ${index} (% a.a.)`;
					next.push([label, String(forecast)]);
					previous.push([label, String(baseline.indexForecastPct[index])]);
				}
			}
			return {
				title: "Ajustar configurações do planejamento",
				lines: diffLines(next, previous),
			};
		}
		case "record-assumption":
			return {
				title: `Registrar premissa: ${change.assumption.summary}`,
				lines: change.assumption.reviewByMonth
					? [
							`Revisar em: ${formatShortPeriodLabel(change.assumption.reviewByMonth)}`,
						]
					: [],
			};
	}
}
