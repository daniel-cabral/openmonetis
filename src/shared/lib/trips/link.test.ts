import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it } from "vitest";
import {
	expandTripLinkScope,
	setTripForTransactions,
	type TripLinkRow,
} from "./link";

const USER_ID = "user-1";
const TRIP_ID = "trip-lisboa";
const render = (condition: unknown) =>
	new PgDialect().sqlToQuery(
		condition as Parameters<PgDialect["sqlToQuery"]>[0],
	);

describe("expandTripLinkScope", () => {
	it("série só de parcelado; recorrente fica na ocorrência; grupos deduplicados", () => {
		expect(
			expandTripLinkScope([
				{ id: "a", condition: "Parcelado", seriesId: "s1", splitGroupId: "g1" },
				{ id: "b", condition: "Parcelado", seriesId: "s1", splitGroupId: null },
				{ id: "c", condition: "À vista", seriesId: null, splitGroupId: "g2" },
				{
					id: "n",
					condition: "Recorrente",
					seriesId: "netflix",
					splitGroupId: null,
				},
			]),
		).toEqual({
			ids: ["a", "b", "c", "n"],
			seriesIds: ["s1"],
			splitGroupIds: ["g1", "g2"],
		});
	});
});

describe("setTripForTransactions", () => {
	let selectRows: TripLinkRow[];
	let captured: { selectWhere?: unknown; set?: unknown; updateWhere?: unknown };
	let selectCalls: number;

	const executor = {
		select: () => ({
			from: () => ({
				where: (condition: unknown) => {
					selectCalls += 1;
					captured.selectWhere = condition;
					return Promise.resolve(selectRows);
				},
			}),
		}),
		update: () => ({
			set: (values: unknown) => {
				captured.set = values;
				return {
					where: (condition: unknown) => {
						captured.updateWhere = condition;
						return {
							returning: () =>
								Promise.resolve(
									Array.from({ length: 10 }, (_, i) => ({ id: `p${i}` })),
								),
						};
					},
				};
			},
		}),
	} as unknown as Parameters<typeof setTripForTransactions>[0];

	beforeEach(() => {
		selectRows = [];
		captured = {};
		selectCalls = 0;
	});

	it("vincular a parcela 1/10 vincula a série inteira", async () => {
		selectRows = [
			{
				id: "parcela-1",
				condition: "Parcelado",
				seriesId: "serie-tap",
				splitGroupId: null,
			},
		];

		const count = await setTripForTransactions(
			executor,
			USER_ID,
			["parcela-1"],
			TRIP_ID,
		);

		expect(count).toBe(10);
		expect(captured.set).toEqual({ tripId: TRIP_ID });
		const where = render(captured.updateWhere);
		expect(where.sql).toContain('"series_id" in');
		expect(where.sql).toContain('"user_id" =');
		expect(where.sql).toContain('"transfer_id" is null');
		expect(where.params).toEqual(
			expect.arrayContaining([USER_ID, "parcela-1", "serie-tap"]),
		);
	});

	it("vincular a Netflix de maio (recorrente) vincula só a ocorrência", async () => {
		selectRows = [
			{
				id: "netflix-maio",
				condition: "Recorrente",
				seriesId: "serie-netflix",
				splitGroupId: null,
			},
		];

		await setTripForTransactions(executor, USER_ID, ["netflix-maio"], TRIP_ID);

		const where = render(captured.updateWhere);
		expect(where.sql).not.toContain('"series_id"');
		expect(where.params).not.toContain("serie-netflix");
		expect(where.params).toEqual(expect.arrayContaining(["netflix-maio"]));
	});

	it("vincular a parte do admin num jantar dividido vincula o grupo", async () => {
		selectRows = [
			{
				id: "jantar-admin",
				condition: "À vista",
				seriesId: null,
				splitGroupId: "grupo-jantar",
			},
		];

		await setTripForTransactions(executor, USER_ID, ["jantar-admin"], TRIP_ID);

		const where = render(captured.updateWhere);
		expect(where.sql).toContain('"split_group_id" in');
		expect(where.params).toEqual(expect.arrayContaining(["grupo-jantar"]));
	});

	it("desvincular a parcela 7/10 solta só ela", async () => {
		selectRows = [
			{
				id: "parcela-7",
				condition: "Parcelado",
				seriesId: "serie-tap",
				splitGroupId: "grupo-7",
			},
		];

		await setTripForTransactions(executor, USER_ID, ["parcela-7"], null);

		expect(captured.set).toEqual({ tripId: null });
		const where = render(captured.updateWhere);
		expect(where.sql).not.toContain('"series_id"');
		expect(where.sql).not.toContain('"split_group_id"');
		expect(where.sql).toContain('"user_id" =');
		expect(where.params).toEqual(
			expect.arrayContaining([USER_ID, "parcela-7"]),
		);
		expect(where.params).not.toContain("serie-tap");
		expect(where.params).not.toContain("grupo-7");
	});

	it("a busca inicial filtra por userId e elegibilidade", async () => {
		selectRows = [
			{ id: "a", condition: "À vista", seriesId: null, splitGroupId: null },
		];
		await setTripForTransactions(executor, USER_ID, ["a"], TRIP_ID);
		const where = render(captured.selectWhere);
		expect(where.sql).toContain('"user_id" =');
		expect(where.sql).toContain('"anotacao" not like');
	});

	it("lista vazia não consulta o banco", async () => {
		expect(await setTripForTransactions(executor, USER_ID, [], TRIP_ID)).toBe(
			0,
		);
		expect(selectCalls).toBe(0);
	});

	it("nenhuma linha elegível do usuário não atualiza nada", async () => {
		selectRows = [];
		expect(
			await setTripForTransactions(executor, USER_ID, ["x"], TRIP_ID),
		).toBe(0);
		expect(captured.set).toBeUndefined();
	});
});
