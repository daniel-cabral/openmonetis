import type { LiquidityKind } from "@/features/planning/lib/engine";

export const ASSUMPTION_KIND_LABEL: Record<string, string> = {
	contribution: "Aporte",
	return: "Retorno",
	bid: "Lance",
	index: "Índice",
	"plan-change": "Mudança de plano",
	other: "Outro",
};

export const SOURCE_LABEL: Record<string, string> = {
	user: "Você",
	planner: "Planejador",
};

export const LIQUIDITY_LABEL: Record<LiquidityKind, string> = {
	daily: "Diária",
	maturity: "No vencimento",
	locked: "Travada",
};
