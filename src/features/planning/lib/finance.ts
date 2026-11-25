import type { Cents } from "@/features/planning/lib/engine";

export class FinanceError extends Error {}

/** Converts a yearly rate in percent to the equivalent monthly rate (fraction). */
export function monthlyRate(annualPct: number): number {
	return (1 + annualPct / 100) ** (1 / 12) - 1;
}

/** Fixed installment that amortizes `principal` over `months` (PMT). */
export function installmentFor(
	principal: Cents,
	months: number,
	annualPct: number,
): Cents {
	const rate = monthlyRate(annualPct);
	if (rate === 0) {
		return Math.round(principal / months);
	}
	return Math.round((principal * rate) / (1 - (1 + rate) ** -months));
}

/** Months needed to pay `principal` with a fixed installment (NPER). */
export function termFor(
	principal: Cents,
	installment: Cents,
	annualPct: number,
): number {
	const rate = monthlyRate(annualPct);
	if (rate === 0) {
		return Math.ceil(principal / installment - 1e-9);
	}
	if (installment <= principal * rate) {
		throw new FinanceError("A parcela não cobre os juros do saldo.");
	}
	const months =
		-Math.log(1 - (principal * rate) / installment) / Math.log(1 + rate);
	return Math.ceil(months - 1e-9);
}

/** Present value of a fixed installment stream (PV of an ordinary annuity). */
export function presentValue(
	installment: Cents,
	months: number,
	annualPct: number,
): Cents {
	const rate = monthlyRate(annualPct);
	if (rate === 0) {
		return installment * months;
	}
	return Math.round((installment * (1 - (1 + rate) ** -months)) / rate);
}

/** Capital that sustains `monthlyIncome` forever, or until `months` run out. */
export function capitalForIncome(
	monthlyIncome: Cents,
	annualRealPct: number,
	mode: "perpetuity" | "drawdown",
	months?: number,
): Cents {
	if (mode === "perpetuity") {
		if (annualRealPct <= 0) {
			throw new FinanceError("Perpetuidade exige taxa real maior que zero.");
		}
		return Math.round(monthlyIncome / monthlyRate(annualRealPct));
	}
	if (months === undefined) {
		throw new FinanceError(
			"Informe em quantos meses o capital será consumido.",
		);
	}
	return presentValue(monthlyIncome, months, annualRealPct);
}

export type FinanceRequest =
	| {
			op: "installment";
			principal: Cents;
			months: number;
			annualRatePct: number;
	  }
	| { op: "term"; principal: Cents; installment: Cents; annualRatePct: number }
	| {
			op: "present_value";
			installment: Cents;
			months: number;
			annualRatePct: number;
	  }
	| {
			op: "capital_for_income";
			monthlyIncome: Cents;
			annualRealRatePct: number;
			mode: "perpetuity" | "drawdown";
			months?: number;
	  };

export type FinanceResult = {
	request: FinanceRequest;
	value: number;
	unit: "cents" | "months";
	outsideProjection: true;
};

export function runFinanceCalc(request: FinanceRequest): FinanceResult {
	switch (request.op) {
		case "installment":
			return {
				request,
				value: installmentFor(
					request.principal,
					request.months,
					request.annualRatePct,
				),
				unit: "cents",
				outsideProjection: true,
			};
		case "term":
			return {
				request,
				value: termFor(
					request.principal,
					request.installment,
					request.annualRatePct,
				),
				unit: "months",
				outsideProjection: true,
			};
		case "present_value":
			return {
				request,
				value: presentValue(
					request.installment,
					request.months,
					request.annualRatePct,
				),
				unit: "cents",
				outsideProjection: true,
			};
		case "capital_for_income":
			return {
				request,
				value: capitalForIncome(
					request.monthlyIncome,
					request.annualRealRatePct,
					request.mode,
					request.months,
				),
				unit: "cents",
				outsideProjection: true,
			};
	}
}
