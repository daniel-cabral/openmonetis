import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
	const writes: { kind: string; payload?: unknown; where?: unknown }[] = [];
	const returningQueue: unknown[][] = [];
	const dbMock = {
		insert: () => ({
			values: (payload: unknown) => {
				writes.push({ kind: "insert", payload });
				return {
					returning: () => Promise.resolve(returningQueue.shift() ?? []),
				};
			},
		}),
		update: () => ({
			set: (payload: unknown) => ({
				where: (where: unknown) => {
					writes.push({ kind: "update", payload, where });
					return {
						returning: () => Promise.resolve(returningQueue.shift() ?? []),
					};
				},
			}),
		}),
		delete: () => ({
			where: (where: unknown) => {
				writes.push({ kind: "delete", where });
				return {
					returning: () => Promise.resolve(returningQueue.shift() ?? []),
				};
			},
		}),
	};
	return {
		writes,
		returningQueue,
		dbMock,
		getUserMock: vi.fn(),
		fetchUserTripsMock: vi.fn(),
		revalidateMock: vi.fn(),
	};
});

vi.mock("@/shared/lib/db", () => ({ db: mocks.dbMock }));
vi.mock("@/shared/lib/auth/server", () => ({ getUser: mocks.getUserMock }));
vi.mock("@/shared/lib/trips/queries", () => ({
	fetchUserTrips: mocks.fetchUserTripsMock,
}));
vi.mock("@/shared/lib/actions/helpers", () => ({
	revalidateForEntity: mocks.revalidateMock,
	handleActionError: (error: unknown) => ({
		success: false,
		error:
			error && typeof error === "object" && "issues" in error
				? (error as { issues: { message: string }[] }).issues[0]?.message
				: "Ocorreu um erro inesperado. Tente novamente.",
	}),
}));

import {
	createTripAction,
	deleteTripAction,
	updateTripAction,
} from "./actions";

const USER_ID = "user-1";
const LISBOA_ID = "11111111-1111-4111-8111-111111111111";
const lisboa = {
	id: LISBOA_ID,
	name: "Lisboa",
	startDate: "2026-05-12",
	endDate: "2026-05-22",
};
const render = (condition: unknown) =>
	new PgDialect().sqlToQuery(
		condition as Parameters<PgDialect["sqlToQuery"]>[0],
	);

beforeEach(() => {
	mocks.writes.length = 0;
	mocks.returningQueue.length = 0;
	vi.clearAllMocks();
	mocks.getUserMock.mockResolvedValue({ id: USER_ID });
	mocks.fetchUserTripsMock.mockResolvedValue([lisboa]);
});

describe("createTripAction", () => {
	it("rejeita Porto que cruza Lisboa e não grava", async () => {
		const result = await createTripAction({
			name: "Porto",
			startDate: "2026-05-20",
			endDate: "2026-05-25",
		});

		expect(result.success).toBe(false);
		expect(!result.success && result.error).toContain('"Lisboa"');
		expect(mocks.writes).toHaveLength(0);
		expect(mocks.fetchUserTripsMock).toHaveBeenCalledWith(USER_ID);
	});

	it("cria viagem sem conflito com o userId da sessão", async () => {
		mocks.returningQueue.push([{ id: "nova" }]);

		const result = await createTripAction({
			name: "Santiago",
			startDate: "2026-09-01",
			endDate: "2026-09-05",
			note: "férias",
		});

		expect(result).toMatchObject({ success: true, data: { tripId: "nova" } });
		expect(mocks.writes[0]).toMatchObject({
			kind: "insert",
			payload: { userId: USER_ID, name: "Santiago", note: "férias" },
		});
		expect(mocks.revalidateMock).toHaveBeenCalledWith("trips", USER_ID);
	});

	it("fim antes do início volta a mensagem do schema", async () => {
		const result = await createTripAction({
			name: "X",
			startDate: "2026-09-05",
			endDate: "2026-09-01",
		});
		expect(result).toEqual({
			success: false,
			error: "A data de fim deve ser igual ou posterior à data de início.",
		});
	});
});

describe("updateTripAction", () => {
	it("pode estender a própria viagem", async () => {
		mocks.returningQueue.push([{ id: LISBOA_ID }]);
		const result = await updateTripAction({ ...lisboa, endDate: "2026-05-24" });
		expect(result.success).toBe(true);
		const where = render(mocks.writes[0]?.where);
		expect(where.params).toEqual(expect.arrayContaining([LISBOA_ID, USER_ID]));
	});

	it("viagem de outro usuário volta não encontrada", async () => {
		mocks.fetchUserTripsMock.mockResolvedValue([]);
		mocks.returningQueue.push([]);
		const result = await updateTripAction({ ...lisboa, name: "Lisboa 2" });
		expect(result).toEqual({ success: false, error: "Viagem não encontrada." });
	});
});

describe("deleteTripAction", () => {
	it("exclui só a viagem do usuário", async () => {
		mocks.returningQueue.push([{ id: LISBOA_ID }]);
		const result = await deleteTripAction({ id: LISBOA_ID });
		expect(result.success).toBe(true);
		const where = render(mocks.writes[0]?.where);
		expect(where.sql).toContain('"user_id" =');
		expect(where.params).toEqual(expect.arrayContaining([LISBOA_ID, USER_ID]));
	});
});
