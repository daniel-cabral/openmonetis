import {
	AiProviderTemporaryError,
	AiReconnectRequiredError,
} from "../credentials/errors";
import {
	CHATGPT_CLIENT_ID,
	CHATGPT_ISSUER,
	CHATGPT_MIN_POLL_INTERVAL_SECONDS,
} from "./constants";

const PROVIDER = "chatgpt";

export type FetchLike = typeof fetch;

export type ChatGptDeviceCode = {
	userCode: string;
	deviceAuthId: string;
	verificationUrl: string;
	pollIntervalSeconds: number;
};

export async function requestDeviceCode(
	fetchImpl: FetchLike = fetch,
): Promise<ChatGptDeviceCode> {
	const response = await fetchImpl(
		`${CHATGPT_ISSUER}/api/accounts/deviceauth/usercode`,
		{
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ client_id: CHATGPT_CLIENT_ID }),
		},
	);
	if (!response.ok) {
		throw new Error(
			`Device code request failed with status ${response.status}`,
		);
	}
	const body = (await response.json()) as {
		user_code: string;
		device_auth_id: string;
		interval: string | number;
	};
	return {
		userCode: body.user_code,
		deviceAuthId: body.device_auth_id,
		verificationUrl: `${CHATGPT_ISSUER}/codex/device`,
		pollIntervalSeconds: Math.max(
			CHATGPT_MIN_POLL_INTERVAL_SECONDS,
			Number(body.interval) || 0,
		),
	};
}

export type ChatGptDevicePollResult =
	| { state: "pending" }
	| { state: "authorized"; authorizationCode: string; codeVerifier: string };

export async function pollDeviceCode(
	deviceAuthId: string,
	userCode: string,
	fetchImpl: FetchLike = fetch,
): Promise<ChatGptDevicePollResult> {
	const response = await fetchImpl(
		`${CHATGPT_ISSUER}/api/accounts/deviceauth/token`,
		{
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				device_auth_id: deviceAuthId,
				user_code: userCode,
			}),
		},
	);
	if (response.status === 403 || response.status === 404) {
		return { state: "pending" };
	}
	if (response.status === 200) {
		const body = (await response.json()) as {
			authorization_code: string;
			code_verifier: string;
		};
		return {
			state: "authorized",
			authorizationCode: body.authorization_code,
			codeVerifier: body.code_verifier,
		};
	}
	throw new Error(`Unexpected device code poll status ${response.status}`);
}

export type ChatGptTokens = {
	accessToken: string;
	refreshToken: string;
	idToken: string;
	expiresIn: number;
};

type TokenResponseBody = {
	access_token: string;
	refresh_token: string;
	id_token: string;
	expires_in: number;
};

function toTokens(body: TokenResponseBody): ChatGptTokens {
	return {
		accessToken: body.access_token,
		refreshToken: body.refresh_token,
		idToken: body.id_token,
		expiresIn: body.expires_in,
	};
}

export async function exchangeCode(
	deviceToken: { authorizationCode: string; codeVerifier: string },
	fetchImpl: FetchLike = fetch,
): Promise<ChatGptTokens> {
	const response = await fetchImpl(`${CHATGPT_ISSUER}/oauth/token`, {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			grant_type: "authorization_code",
			code: deviceToken.authorizationCode,
			redirect_uri: `${CHATGPT_ISSUER}/deviceauth/callback`,
			client_id: CHATGPT_CLIENT_ID,
			code_verifier: deviceToken.codeVerifier,
		}),
	});
	if (!response.ok) {
		throw new Error(`Token exchange failed with status ${response.status}`);
	}
	return toTokens((await response.json()) as TokenResponseBody);
}

export async function refreshTokens(
	refreshToken: string,
	fetchImpl: FetchLike = fetch,
): Promise<ChatGptTokens> {
	const response = await fetchImpl(`${CHATGPT_ISSUER}/oauth/token`, {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			grant_type: "refresh_token",
			refresh_token: refreshToken,
			client_id: CHATGPT_CLIENT_ID,
		}),
	});
	if (response.status === 400 || response.status === 401) {
		throw new AiReconnectRequiredError(PROVIDER);
	}
	if (response.status === 429 || response.status >= 500) {
		throw new AiProviderTemporaryError(PROVIDER, response.status);
	}
	return toTokens((await response.json()) as TokenResponseBody);
}

export type ChatGptAccessTokenClaims = {
	accountId: string;
	email: string | null;
	planType: string | null;
	expiresAt: Date;
};

function decodeJwtPayload(jwt: string): Record<string, unknown> {
	const segments = jwt.split(".");
	if (segments.length < 2) {
		throw new Error("Not a JWT: missing payload segment.");
	}
	const normalized = segments[1].replace(/-/g, "+").replace(/_/g, "/");
	const padded = normalized.padEnd(
		normalized.length + ((4 - (normalized.length % 4)) % 4),
		"=",
	);
	return JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as Record<
		string,
		unknown
	>;
}

function extractEmail(profile: unknown): string | null {
	if (typeof profile === "string") {
		return profile.includes("@") ? profile : null;
	}
	if (profile !== null && typeof profile === "object" && "email" in profile) {
		const email = (profile as { email?: unknown }).email;
		return typeof email === "string" ? email : null;
	}
	return null;
}

export function readAccessTokenClaims(
	accessToken: string,
): ChatGptAccessTokenClaims {
	const claims = decodeJwtPayload(accessToken);
	const auth = claims["https://api.openai.com/auth"] as
		| { chatgpt_account_id?: string; chatgpt_plan_type?: string }
		| undefined;
	const accountId = auth?.chatgpt_account_id;
	if (!accountId) {
		throw new Error(
			"The access token does not carry a chatgpt_account_id claim.",
		);
	}
	const exp = claims.exp;
	if (typeof exp !== "number") {
		throw new Error("The access token does not carry an exp claim.");
	}
	return {
		accountId,
		email: extractEmail(claims["https://api.openai.com/profile"]),
		planType:
			typeof auth?.chatgpt_plan_type === "string"
				? auth.chatgpt_plan_type
				: null,
		expiresAt: new Date(exp * 1000),
	};
}
