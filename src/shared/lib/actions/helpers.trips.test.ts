import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	revalidatePath: vi.fn(),
	revalidateTag: vi.fn(),
}));
vi.mock("next/cache", () => mocks);

import { NAV_SECTIONS } from "@/shared/components/navigation/navbar/nav-items";
import { revalidateForEntity } from "./helpers";

beforeEach(() => vi.clearAllMocks());

describe("revalidateForEntity trips", () => {
	it("revalida a lista de viagens e os lançamentos", () => {
		revalidateForEntity("trips", "user-1");
		const paths = mocks.revalidatePath.mock.calls.map(([path]) => path);
		expect(paths).toEqual(expect.arrayContaining(["/trips", "/transactions"]));
	});

	it("editar lançamento também revalida viagens", () => {
		revalidateForEntity("transactions", "user-1");
		const paths = mocks.revalidatePath.mock.calls.map(([path]) => path);
		expect(paths).toContain("/trips");
	});
});

describe("menu", () => {
	it("tem o item Viagens em Organização", () => {
		const organizacao = NAV_SECTIONS.find(
			(section) => section.label === "Organização",
		);
		expect(organizacao?.items.map((item) => item.href)).toContain("/trips");
	});
});
