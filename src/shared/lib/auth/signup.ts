export function isSignupDisabled(): boolean {
	const value = process.env.DISABLE_SIGNUP?.trim().toLowerCase();
	return value === "true";
}
