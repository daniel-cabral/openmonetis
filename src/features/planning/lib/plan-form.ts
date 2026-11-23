import type {
	MoneyBasis,
	Period,
	PlanLifecycle,
	PriceIndex,
} from "@/features/planning/lib/engine";
import { centsToDecimal, toCents } from "@/features/planning/lib/cents";
import type { PlanInput } from "@/features/planning/lib/schemas";
import type { PlanView } from "@/features/planning/lib/snapshot-types";
import { normalizeDecimalInput } from "@/shared/utils/currency";

export type PlanFormValues = {
	type: "goal" | "consorcio";
	name: string;
	nonNegotiable: boolean;
	lifecycle: PlanLifecycle;
	basis: MoneyBasis;
	index: PriceIndex;
	targetMonth: Period;
	hasWindow: boolean;
	windowEarliest: Period;
	windowLatest: Period;
	potAccountIds: string[];
	hasRange: boolean;
	targetMin: string;
	targetBase: string;
	targetMax: string;
	letterValue: string;
	outstandingBalance: string;
	bidBase: "letter" | "outstanding" | "both";
	marginPp: string;
	embeddedBidEnabled: boolean;
	embeddedBidPct: string;
};

export function emptyPlanForm(
	type: "goal" | "consorcio",
	currentMonth: Period,
): PlanFormValues {
	return {
		type,
		name: "",
		nonNegotiable: false,
		lifecycle: "active",
		basis: "today",
		index: "IPCA",
		targetMonth: currentMonth,
		hasWindow: false,
		windowEarliest: currentMonth,
		windowLatest: currentMonth,
		potAccountIds: [],
		hasRange: false,
		targetMin: "",
		targetBase: "",
		targetMax: "",
		letterValue: "",
		outstandingBalance: "",
		bidBase: "both",
		marginPp: "0",
		embeddedBidEnabled: false,
		embeddedBidPct: "0",
	};
}

export function planToForm(plan: PlanView): PlanFormValues {
	const { fields, window } = plan;
	const common = {
		...emptyPlanForm(plan.type, plan.targetMonth),
		name: plan.name,
		nonNegotiable: plan.nonNegotiable,
		lifecycle: plan.lifecycle,
		basis: plan.basis,
		index: plan.index,
		targetMonth: plan.targetMonth,
		hasWindow: window !== null,
		windowEarliest: window?.earliest ?? plan.targetMonth,
		windowLatest: window?.latest ?? plan.targetMonth,
		potAccountIds: [...plan.potAccountIds],
	};

	if (fields.type === "goal") {
		const { min, base, max } = fields.target;
		return {
			...common,
			hasRange: min !== base || base !== max,
			targetMin: centsToDecimal(min),
			targetBase: centsToDecimal(base),
			targetMax: centsToDecimal(max),
		};
	}

	return {
		...common,
		letterValue: centsToDecimal(fields.letterValue),
		outstandingBalance: centsToDecimal(fields.outstandingBalance),
		bidBase: fields.bidBase,
		marginPp: String(fields.marginPp),
		embeddedBidEnabled: fields.embeddedBid.enabled,
		embeddedBidPct: String(fields.embeddedBid.pct),
	};
}

const toAmount = (value: string) => toCents(normalizeDecimalInput(value));
const toNumber = (value: string) => Number(normalizeDecimalInput(value));

export function formToPlanInput(values: PlanFormValues): PlanInput {
	const fields: PlanInput["fields"] =
		values.type === "goal"
			? {
					type: "goal",
					target: values.hasRange
						? {
								min: toAmount(values.targetMin),
								base: toAmount(values.targetBase),
								max: toAmount(values.targetMax),
							}
						: {
								min: toAmount(values.targetBase),
								base: toAmount(values.targetBase),
								max: toAmount(values.targetBase),
							},
				}
			: {
					type: "consorcio",
					letterValue: toAmount(values.letterValue),
					outstandingBalance: toAmount(values.outstandingBalance),
					bidBase: values.bidBase,
					marginPp: toNumber(values.marginPp),
					embeddedBid: {
						enabled: values.embeddedBidEnabled,
						pct: toNumber(values.embeddedBidPct),
					},
				};

	return {
		name: values.name,
		nonNegotiable: values.nonNegotiable,
		lifecycle: values.lifecycle,
		basis: values.basis,
		index: values.index,
		targetMonth: values.targetMonth,
		window: values.hasWindow
			? { earliest: values.windowEarliest, latest: values.windowLatest }
			: null,
		potAccountIds: values.potAccountIds,
		fields,
	};
}
