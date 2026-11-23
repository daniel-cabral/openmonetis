export class AiCredentialKeyError extends Error {
	constructor() {
		super("AI credential key is missing or cannot decrypt the secret");
		this.name = "AiCredentialKeyError";
	}
}

export class AiCredentialMissingError extends Error {
	constructor(readonly provider: string) {
		super(`No AI credential stored for provider ${provider}`);
		this.name = "AiCredentialMissingError";
	}
}

// ChatGPT session refused by the backend (refresh 400/401 or inference 401).
export class AiReconnectRequiredError extends Error {
	constructor(readonly provider: string) {
		super(`AI credential for ${provider} needs to be reconnected`);
		this.name = "AiReconnectRequiredError";
	}
}

// The stored secret no longer decrypts (e.g. BETTER_AUTH_SECRET rotated).
export class AiCredentialInvalidError extends Error {
	constructor(readonly provider: string) {
		super(`AI credential for ${provider} is no longer readable`);
		this.name = "AiCredentialInvalidError";
	}
}

export class AiProviderTemporaryError extends Error {
	constructor(
		readonly provider: string,
		readonly status: number,
	) {
		super(`AI provider ${provider} is temporarily unavailable (${status})`);
		this.name = "AiProviderTemporaryError";
	}
}
