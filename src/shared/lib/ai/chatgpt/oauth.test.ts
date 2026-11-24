import { describe, expect, it } from "vitest";
import {
	AiProviderTemporaryError,
	AiReconnectRequiredError,
} from "../credentials/errors";
import {
	pollDeviceCode,
	readAccessTokenClaims,
	refreshTokens,
	requestDeviceCode,
} from "./oauth";

const jsonResponse = (status: number, body: unknown): Response =>
	new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});

const encodeJwt = (payload: Record<string, unknown>): string => {
	const part = (value: object) =>
		Buffer.from(JSON.stringify(value)).toString("base64url");
	return `${part({ alg: "RS256", typ: "JWT" })}.${part(payload)}.signature`;
};

describe("chatgpt oauth client", () => {
	it("device code clamps the poll interval to 3 seconds", async () => {
		let captured: { url?: string; body?: unknown } = {};
		const fetchImpl = (async (url: string, init?: RequestInit) => {
			captured = { url, body: JSON.parse(init?.body as string) };
			return jsonResponse(200, {
				user_code: "ABCD-1234",
				device_auth_id: "dev-1",
				interval: "1",
			});
		}) as typeof fetch;

		const result = await requestDeviceCode(fetchImpl);

		expect(captured.url).toBe(
			"https://auth.openai.com/api/accounts/deviceauth/usercode",
		);
		expect(captured.body).toEqual({
			client_id: "app_EMoamEEZ73f0CkXaXp7hrann",
		});
		expect(result).toEqual({
			userCode: "ABCD-1234",
			deviceAuthId: "dev-1",
			verificationUrl: "https://auth.openai.com/codex/device",
			pollIntervalSeconds: 3,
		});
	});

	it.each([403, 404])("poll treats %i as pending", async (status) => {
		const fetchImpl = (async () => jsonResponse(status, {})) as typeof fetch;

		await expect(pollDeviceCode("dev", "code", fetchImpl)).resolves.toEqual({
			state: "pending",
		});
	});

	it.each([
		[400, AiReconnectRequiredError],
		[401, AiReconnectRequiredError],
		[403, AiReconnectRequiredError],
		[429, AiProviderTemporaryError],
		[503, AiProviderTemporaryError],
	])("refresh maps %i to the right error", async (status, errorClass) => {
		const fetchImpl = (async () => jsonResponse(status, {})) as typeof fetch;

		await expect(refreshTokens("rt", fetchImpl)).rejects.toBeInstanceOf(
			errorClass,
		);
	});

	it("claims read account, e-mail, plan and expiry", () => {
		const token = encodeJwt({
			"https://api.openai.com/auth": {
				chatgpt_account_id: "acc-1",
				chatgpt_plan_type: "plus",
			},
			"https://api.openai.com/profile": { email: "me@example.com" },
			exp: 1790434596,
		});

		expect(readAccessTokenClaims(token)).toEqual({
			accountId: "acc-1",
			email: "me@example.com",
			planType: "plus",
			expiresAt: new Date(1790434596 * 1000),
		});
	});
});
