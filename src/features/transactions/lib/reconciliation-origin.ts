import type { SelectOption } from "@/features/transactions/components/types";
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

// Menos que isso não identifica conta nenhuma.
const MIN_ACCOUNT_DIGITS = 4;

function digitsOf(value: string): string {
	return value.replace(/\D/g, "");
}

/**
 * Pré-preenchimento do destino a partir do que o arquivo traz. `contas` não
 * guarda número de conta, então o casamento é pelos dígitos que o usuário
 * escreveu no nome da conta. Sem correspondência única o destino continua
 * vazio — o valor do arquivo é sugestão, nunca decisão.
 */
export function matchAccountOptionByNumber(
	accountNumber: string | null | undefined,
	accountOptions: SelectOption[],
): string | null {
	if (!accountNumber) return null;

	// O preâmbulo do C6 traz "<agência>/<conta>"; a agência não identifica nada.
	const fileDigits = digitsOf(accountNumber.split("/").at(-1) ?? "");
	if (fileDigits.length < MIN_ACCOUNT_DIGITS) return null;

	const matches = accountOptions.filter((option) => {
		const labelDigits = digitsOf(option.label);
		if (labelDigits.length < MIN_ACCOUNT_DIGITS) return false;
		return labelDigits.includes(fileDigits) || fileDigits.includes(labelDigits);
	});

	return matches.length === 1 ? matches[0].value : null;
}
