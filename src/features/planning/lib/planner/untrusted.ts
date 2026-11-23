export const UNTRUSTED_OPEN = "<<<DADOS_DO_USUARIO>>>";
export const UNTRUSTED_CLOSE = "<<<FIM_DADOS_DO_USUARIO>>>";

const CONTROL_CHARS = /\p{Cc}/gu;

/** Cleans a user-entered string before it enters the model prompt. */
export function capUntrusted(text: string, max: number): string {
	const clean = text
		.replaceAll(UNTRUSTED_OPEN, "")
		.replaceAll(UNTRUSTED_CLOSE, "")
		.replace(CONTROL_CHARS, " ")
		.trim();
	return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}
