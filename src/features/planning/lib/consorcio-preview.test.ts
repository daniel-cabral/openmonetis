import { describe, expect, it } from "vitest";
import type { BidPoint, ConsorcioFields } from "@/features/planning/lib/engine";
import { buildBidPreview } from "./consorcio-preview";

const history = [
	["2026-06", 50],
	["2026-07", 30],
	["2026-08", 32],
	["2026-09", 35],
	["2026-10", 33],
	["2026-11", 34],
	["2026-12", 36],
].map(([month, winningBidPct]) => ({ month, winningBidPct })) as BidPoint[];

const fields: ConsorcioFields = {
	type: "consorcio",
	letterValue: 1_000_000,
	outstandingBalance: 800_000,
	bidBase: "both",
	marginPp: 2,
	embeddedBid: { enabled: false, pct: 0 },
};

describe("buildBidPreview", () => {
	it("previews both bases at the target month with the INCC-inflated letter", () => {
		const preview = buildBidPreview(
			fields,
			history,
			10,
			"2027-01",
			"2028-01",
			"today",
		);

		expect(preview.letter).toEqual({
			min: 352_000,
			base: 418_000,
			max: 418_000,
		});
		expect(preview.outstanding).toEqual({
			min: 256_000,
			base: 304_000,
			max: 304_000,
		});
	});

	it("keeps the letter value nominal when the plan is not in today's money", () => {
		const preview = buildBidPreview(
			fields,
			history,
			10,
			"2027-01",
			"2028-01",
			"nominal",
		);

		expect(preview.letter).toEqual({
			min: 320_000,
			base: 380_000,
			max: 380_000,
		});
	});

	it("returns no preview without bid history", () => {
		expect(
			buildBidPreview(fields, [], 10, "2027-01", "2028-01", "today"),
		).toEqual({
			pct: null,
			letter: null,
			outstanding: null,
			afterBid: null,
		});
	});

	it("previews the installment after the bid", () => {
		const preview = buildBidPreview(
			{
				...fields,
				bidBase: "letter",
				marginPp: 0,
				letterValue: 10_000_000,
				monthlyInstallment: 200_000,
				lastInstallmentMonth: "2028-12",
			},
			[{ month: "2027-02", winningBidPct: 30 }] as BidPoint[],
			0,
			"2027-01",
			"2027-03",
			"nominal",
		);

		expect(preview.afterBid?.base).toEqual({ amount: 57_143, months: 21 });
	});
});
