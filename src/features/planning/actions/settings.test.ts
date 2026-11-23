import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	getUserIdMock,
	revalidatePathMock,
	revalidateTagMock,
	previousRows,
	writes,
	dbMock,
} = vi.hoisted(() => {
	const previousRows: unknown[] = [];
	const writes: {
		kind: string;
		table: unknown;
		payload: unknown;
		config?: unknown;
	}[] = [];

	const tx = {
		select: () => ({
			from: () => ({
				where: () => Promise.resolve(previousRows),
			}),
		}),
		insert: (table: unknown) => ({
			values: (payload: unknown) => {
				const write: (typeof writes)[number] = {
					kind: "insert",
					table,
					payload,
					config: undefined,
				};
				writes.push(write);
				return Object.assign(Promise.resolve(undefined), {
					onConflictDoUpdate: (config: unknown) => {
						write.kind = "upsert";
						write.config = config;
						return Promise.resolve(undefined);
					},
				});
			},
		}),
	};

	return {
		getUserIdMock: vi.fn(),
		revalidatePathMock: vi.fn(),
		revalidateTagMock: vi.fn(),
		previousRows,
		writes,
		dbMock: {
			transaction: (callback: (t: typeof tx) => unknown) => callback(tx),
		},
	};
});

vi.mock("@/shared/lib/auth/server", () => ({ getUserId: getUserIdMock }));
vi.mock("@/shared/lib/db", () => ({ db: dbMock }));
vi.mock("next/cache", () => ({
	revalidatePath: revalidatePathMock,
	revalidateTag: revalidateTagMock,
}));

import { assumptionLog, planningSettings } from "@/db/schema";
import { savePlanningSettingsAction } from "./settings";

const USER_ID = "user-1";

const previousSettingsRow = {
	userId: USER_ID,
	plannedContribution: "1000.00",
	reserveMonths: 3,
	baselineMonths: 6,
	ipcaForecastPct: "4.00",
	inccForecastPct: "5.00",
	horizonEnd: null,
	stressContributionCap: null,
	stressIncomeLossMonths: 3,
	stressPlanCostPct: "10.00",
	plannerModelId: null,
};

const settingsInput = {
	plannedContribution: 100000,
	reserveMonths: 3,
	baselineMonths: 6,
	indexForecastPct: { IPCA: 4.5, INCC: 5 },
	horizonEnd: null,
	stressContributionCap: null,
	stressIncomeLossMonths: 3,
	stressPlanCostPct: 10,
	plannerModelId: null,
};

describe("savePlanningSettingsAction", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		writes.length = 0;
		previousRows.length = 0;
		previousRows.push(previousSettingsRow);
		getUserIdMock.mockResolvedValue(USER_ID);
	});

	it("saves settings and logs one user assumption per changed forecast", async () => {
		const result = await savePlanningSettingsAction(settingsInput);

		expect(result.success).toBe(true);
		expect(writes.filter((w) => w.table === planningSettings)).toEqual([
			expect.objectContaining({ kind: "upsert" }),
		]);
		expect(writes.filter((w) => w.table === assumptionLog)).toEqual([
			expect.objectContaining({
				payload: expect.objectContaining({
					kind: "index",
					source: "user",
					summary: "Previsão de IPCA: 4,00% → 4,50% ao ano",
				}),
			}),
		]);
		expect(revalidatePathMock).toHaveBeenCalledWith("/planning");
	});

	it("rejects invalid input without writing", async () => {
		const result = await savePlanningSettingsAction({
			...settingsInput,
			reserveMonths: 30,
		});

		expect(result.success).toBe(false);
		expect(writes).toEqual([]);
	});
});
