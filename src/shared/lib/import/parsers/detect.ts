import { type ParserProfile, parserProfiles } from "./registry";

export type DetectResult = {
	detected: ParserProfile | null;
	profiles: ParserProfile[];
};

// Detecção é sugestão, não decisão final: sempre devolve a lista completa de
// perfis junto com o detectado (ou null), para a UI oferecer como opção.
export function detectParserProfile(content: string): DetectResult {
	const detected = parserProfiles.find((profile) => profile.matches(content)) ?? null;
	return { detected, profiles: parserProfiles };
}
