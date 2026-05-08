export type SectionType = "Adicionado" | "Alterado" | "Corrigido" | "Removido";

export const SECTION_TYPES: readonly SectionType[] = [
	"Adicionado",
	"Alterado",
	"Corrigido",
	"Removido",
];

export type ChangelogSection = {
	type: SectionType;
	items: string[];
};

export type BumpType = "major" | "minor" | "patch";

export type ChangelogVersion = {
	version: string;
	/** Formato exibido "DD/MM/YYYY". */
	date: string;
	/** Data ISO crua "YYYY-MM-DD" para ordenação e formatação client-side. */
	isoDate: string;
	bump: BumpType;
	summary?: string;
	sections: ChangelogSection[];
};

export function isSectionType(value: string): value is SectionType {
	return (SECTION_TYPES as readonly string[]).includes(value);
}
