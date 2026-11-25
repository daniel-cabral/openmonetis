import { describe, expect, it } from "vitest";
import { FinanceError, type FinanceRequest, runFinanceCalc } from "./finance";

describe("runFinanceCalc", () => {
	it.each<[string, FinanceRequest, number, "cents" | "months"]>([
		[
			"installment",
			{
				op: "installment",
				principal: 10_000_000,
				months: 12,
				annualRatePct: 12,
			},
			885_621,
			"cents",
		],
		[
			"installment at zero rate",
			{
				op: "installment",
				principal: 12_000_000,
				months: 120,
				annualRatePct: 0,
			},
			100_000,
			"cents",
		],
		[
			"term (ceil tolerates float error)",
			{
				op: "term",
				principal: 10_000_000,
				installment: 885_621,
				annualRatePct: 12,
			},
			12,
			"months",
		],
		[
			"term at zero rate",
			{
				op: "term",
				principal: 1_000_000,
				installment: 300_000,
				annualRatePct: 0,
			},
			4,
			"months",
		],
		[
			"present_value",
			{
				op: "present_value",
				installment: 100_000,
				months: 12,
				annualRatePct: 12,
			},
			1_129_152,
			"cents",
		],
		[
			"capital_for_income perpetuity",
			{
				op: "capital_for_income",
				monthlyIncome: 500_000,
				annualRealRatePct: 6,
				mode: "perpetuity",
			},
			102_721_070,
			"cents",
		],
		[
			"capital_for_income drawdown",
			{
				op: "capital_for_income",
				monthlyIncome: 500_000,
				annualRealRatePct: 6,
				mode: "drawdown",
				months: 240,
			},
			70_692_154,
			"cents",
		],
	])("computes %s", (_name, request, value, unit) => {
		expect(runFinanceCalc(request)).toEqual({
			request,
			value,
			unit,
			outsideProjection: true,
		});
	});

	it.each<[string, FinanceRequest, string]>([
		[
			"perpetuity at zero real rate",
			{
				op: "capital_for_income",
				monthlyIncome: 500_000,
				annualRealRatePct: 0,
				mode: "perpetuity",
			},
			"Perpetuidade exige taxa real maior que zero.",
		],
		[
			"an installment that does not cover the interest",
			{
				op: "term",
				principal: 10_000_000,
				installment: 10_000,
				annualRatePct: 12,
			},
			"A parcela não cobre os juros do saldo.",
		],
		[
			"a drawdown without months",
			{
				op: "capital_for_income",
				monthlyIncome: 500_000,
				annualRealRatePct: 6,
				mode: "drawdown",
			},
			"Informe em quantos meses o capital será consumido.",
		],
	])("rejects %s", (_name, request, message) => {
		expect(() => runFinanceCalc(request)).toThrow(FinanceError);
		expect(() => runFinanceCalc(request)).toThrow(message);
	});
});
