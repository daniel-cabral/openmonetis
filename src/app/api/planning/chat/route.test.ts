import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getOptionalUserSession: vi.fn(),
	select: vi.fn(),
	insert: vi.fn(),
	transaction: vi.fn(),
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
});
