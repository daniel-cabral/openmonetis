import type { DetectResult } from "@/shared/lib/import/parsers/detect";
import type { ParserProfile } from "@/shared/lib/import/parsers/registry";

// Detecção é sugestão: o perfil detectado é apenas o valor inicial do select,
// sempre editável pelo usuário na confirmação de origem.
export function resolveDefaultProfileId(detectResult: DetectResult): string | null {
	return detectResult.detected?.id ?? detectResult.profiles[0]?.id ?? null;
}

// Perfil de extrato exige conta de destino; perfil de fatura exige cartão.
export function destinationKindForProfile(
	profile: ParserProfile | null,
): "account" | "card" | null {
	if (!profile) return null;
	return profile.kind === "invoice" ? "card" : "account";
}
