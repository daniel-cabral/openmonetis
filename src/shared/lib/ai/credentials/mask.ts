const SHORT_KEY_LENGTH = 12;
const PREFIX_WINDOW = 7;

export function maskApiKey(key: string): string {
	if (key.length < SHORT_KEY_LENGTH) {
		return `…${key.slice(-2)}`;
	}
	const lastDash = key.slice(0, PREFIX_WINDOW).lastIndexOf("-");
	const prefix = lastDash >= 0 ? key.slice(0, lastDash + 1) : key.slice(0, 4);
	return `${prefix}…${key.slice(-4)}`;
}
