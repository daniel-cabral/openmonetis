import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import type { TripOption } from "./queries";
import { tripFilterCondition } from "./trip-filter-condition";
import {
	parseTripFilterParam,
	type TripFilter,
	tripFilterToParam,
} from "./trip-filter-param";

const userTrips: TripOption[] = [
	{
		id: "11111111-1111-4111-8111-111111111111",
		name: "Lisboa",
		startDate: "2026-05-12",
		endDate: "2026-05-22",
	},
];

const dialect = new PgDialect();

describe("parseTripFilterParam", () => {
	it.each<[string, string | null, TripFilter]>([
		["ausente", null, { kind: "all" }],
		["vazio", "", { kind: "all" }],
		["sem", "sem", { kind: "none" }],
		[
			"viagem do usuário",
			"11111111-1111-4111-8111-111111111111",
			{
				kind: "trip",
				tripId: "11111111-1111-4111-8111-111111111111",
				name: "Lisboa",
			},
		],
		[
			"viagem de outro usuário",
			"22222222-2222-4222-8222-222222222222",
			{ kind: "all" },
		],
		["valor inválido", "lixo", { kind: "all" }],
	])("%s", (_label, value, expected) => {
		expect(parseTripFilterParam(value, userTrips)).toEqual(expected);
	});
});

describe("tripFilterToParam", () => {
	it("serializa os três modos", () => {
		expect(tripFilterToParam({ kind: "all" })).toBeNull();
		expect(tripFilterToParam({ kind: "none" })).toBe("sem");
		expect(
			tripFilterToParam({ kind: "trip", tripId: "abc", name: "Lisboa" }),
		).toBe("abc");
	});
});

describe("tripFilterCondition", () => {
	it("all não restringe", () => {
		expect(tripFilterCondition({ kind: "all" })).toBeUndefined();
	});

	it("none exige viagem_id nulo", () => {
		const condition = tripFilterCondition({ kind: "none" }) as SQL;
		const query = dialect.sqlToQuery(condition);
		expect(query.sql).toMatch(/"viagem_id" is null/);
	});

	it("trip exige viagem_id igual ao id", () => {
		const condition = tripFilterCondition({
			kind: "trip",
			tripId: "abc",
			name: "Lisboa",
		}) as SQL;
		const query = dialect.sqlToQuery(condition);
		expect(query.sql).toMatch(/"viagem_id" = \$1/);
		expect(query.params).toEqual(["abc"]);
	});
});
