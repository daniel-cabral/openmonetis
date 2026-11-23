import type { Period, PriceIndex, StressToggles } from "../types";

export type ExpandContext = {
	start: Period;
	end: Period;
	indexForecastPct: Record<PriceIndex, number>;
	stress: StressToggles;
};
