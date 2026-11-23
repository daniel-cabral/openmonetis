import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getOptionalUserSession: vi.fn(),
	select: vi.fn(),
	insert: vi.fn(),
	transaction: vi.fn(),
	fetchPlanningSnapshot: vi.fn(),
	buildPlannerContext: vi.fn(),
	resolveLanguageModel: vi.fn(),
	getAdminPayerId: vi.fn(),
	fetchCategoryTotals: vi.fn(),
	createPlannerResponse: vi.fn(),
}));

vi.mock("@/shared/lib/auth/server", () => ({
	getOptionalUserSession: mocks.getOptionalUserSession,
}));

vi.mock("@/shared/lib/db", () => ({
	db: {
		select: mocks.select,
		insert: mocks.insert,
		transaction: mocks.transaction,
	},
}));

vi.mock("@/features/planning/queries", () => ({
	fetchPlanningSnapshot: mocks.fetchPlanningSnapshot,
}));

vi.mock("@/features/planning/lib/planner/context", () => ({
	buildPlannerContext: mocks.buildPlannerContext,
}));

vi.mock("@/shared/lib/ai/model-provider", () => ({
	resolveLanguageModel: mocks.resolveLanguageModel,
}));

vi.mock("@/shared/lib/payers/get-admin-id", () => ({
	getAdminPayerId: mocks.getAdminPayerId,
}));

vi.mock("@/features/planning/lib/queries/category-totals", () => ({
	fetchCategoryTotals: mocks.fetchCategoryTotals,
}));

vi.mock("@/features/planning/lib/planner/stream", () => ({
	createPlannerResponse: mocks.createPlannerResponse,
}));

import { engineInput } from "@/features/planning/lib/engine/test-fixtures";
import { POST } from "./route";

const CONVERSATION_ID = "0b6f6c5e-3c1a-4f5e-9a1d-2f7d2c9b8a11";

function postChat() {
	return POST(
		new Request("http://localhost/api/planning/chat", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				conversationId: CONVERSATION_ID,
				modelId: "gpt-4o-mini",
				message: {
					id: "msg-user-1",
					role: "user",
					parts: [{ type: "text", text: "Oi" }],
				},
			}),
		}),
	);
}

function selectReturning(rows: unknown[]) {
	const chain = {
		from: () => chain,
		where: () => chain,
		limit: () => Promise.resolve(rows),
		orderBy: () => Promise.resolve(rows),
	};
	return chain;
}

beforeEach(() => {
	vi.resetAllMocks();
});

describe("POST /api/planning/chat", () => {
	it("returns 401 for an anonymous request without touching the database", async () => {
		mocks.getOptionalUserSession.mockResolvedValue(null);

		const response = await postChat();

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({ error: "Não autenticado" });
		expect(mocks.select).not.toHaveBeenCalled();
		expect(mocks.insert).not.toHaveBeenCalled();
		expect(mocks.transaction).not.toHaveBeenCalled();
	});

	it("returns 404 for another user's conversation and persists nothing", async () => {
		mocks.getOptionalUserSession.mockResolvedValue({ user: { id: "user-1" } });
		mocks.select.mockReturnValue(selectReturning([]));

		const response = await postChat();

		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ error: "Conversa não encontrada" });
		expect(mocks.insert).not.toHaveBeenCalled();
		expect(mocks.transaction).not.toHaveBeenCalled();
	});

	it("keeps the contribution category out of the cut candidates", async () => {
		mocks.getOptionalUserSession.mockResolvedValue({ user: { id: "user-1" } });
		mocks.select
			.mockReturnValueOnce(
				selectReturning([{ id: CONVERSATION_ID, title: "Plano" }]),
			)
			.mockReturnValueOnce(selectReturning([]));
		mocks.resolveLanguageModel.mockResolvedValue({ success: true, model: {} });
		mocks.fetchPlanningSnapshot.mockResolvedValue({
			input: engineInput({ startMonth: "2026-11" }),
			settings: { plannedContribution: 0 },
			plans: [],
		});
		mocks.buildPlannerContext.mockReturnValue({});
		mocks.getAdminPayerId.mockResolvedValue("payer-1");
		mocks.fetchCategoryTotals.mockResolvedValue([
			{
				categoryId: "cat-invest",
				categoryName: "Investimentos",
				month: "2026-10",
				amount: 50_000,
			},
			{
				categoryId: "cat-food",
				categoryName: "Alimentação",
				month: "2026-10",
				amount: 30_000,
			},
		]);
		mocks.createPlannerResponse.mockResolvedValue(new Response(null));

		await postChat();

		const { tools } = mocks.createPlannerResponse.mock.calls[0][0];
		const listCutCandidates = tools.list_cut_candidates as unknown as {
			execute: (
				input: unknown,
				options: unknown,
			) => Promise<{ categoryName: string }[]>;
		};
		const candidates = await listCutCandidates.execute({ months: 1 }, {});

		expect(candidates.map((candidate) => candidate.categoryName)).toEqual([
			"Alimentação",
		]);
	});
});
