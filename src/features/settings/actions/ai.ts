"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { aiPendingConnections } from "@/db/schema";
import { CHATGPT_PENDING_TTL_MS } from "@/shared/lib/ai/chatgpt/constants";
import { saveChatGptCredential } from "@/shared/lib/ai/chatgpt/credentials";
import {
	exchangeCode,
	pollDeviceCode,
	readAccessTokenClaims,
	requestDeviceCode,
} from "@/shared/lib/ai/chatgpt/oauth";
import {
	type AiCredentialStatus,
	deleteAiCredential,
	saveApiKeyCredential,
} from "@/shared/lib/ai/credentials/store";
import { getUserId } from "@/shared/lib/auth/server";
import { db } from "@/shared/lib/db";

type ActionResult<T = void> = {
	success: boolean;
	error?: string;
	data?: T;
};

const GENERIC_ERROR = "Algo deu errado";
const API_KEY_ERROR = "Informe a chave de API.";
const BASE_URL_ERROR = "Informe uma URL http(s) válida.";

const providerIdSchema = z.enum([
	"chatgpt",
	"openai",
	"anthropic",
	"google",
	"minimax",
	"openrouter",
	"ollama",
]);

const apiKeyInputSchema = z.discriminatedUnion("provider", [
	z.object({
		provider: z.enum([
			"openai",
			"anthropic",
			"google",
			"minimax",
			"openrouter",
		]),
		apiKey: z.string({ error: API_KEY_ERROR }).trim().min(1, API_KEY_ERROR),
	}),
	z.object({
		provider: z.literal("ollama"),
		baseUrl: z
			.string({ error: BASE_URL_ERROR })
			.trim()
			.pipe(z.url({ protocol: /^https?$/, error: BASE_URL_ERROR })),
		apiKey: z.string().trim().optional(),
	}),
]);

function revalidateAiPaths() {
	revalidatePath("/settings");
	revalidatePath("/insights");
	revalidatePath("/planning");
}

function failure(error: unknown): { success: false; error: string } {
	if (error instanceof z.ZodError) {
		return { success: false, error: error.issues[0]?.message ?? GENERIC_ERROR };
	}
	console.error("[AiSettingsActionError]", error);
	return { success: false, error: GENERIC_ERROR };
}

export async function saveAiApiKeyAction(
	input: unknown,
): Promise<ActionResult<AiCredentialStatus>> {
	const userId = await getUserId();
	try {
		const parsed = apiKeyInputSchema.parse(input);
		const data = await saveApiKeyCredential(userId, parsed);
		revalidateAiPaths();
		return { success: true, data };
	} catch (error) {
		return failure(error);
	}
}

export async function removeAiCredentialAction(
	provider: unknown,
): Promise<ActionResult> {
	const userId = await getUserId();
	try {
		const providerId = providerIdSchema.parse(provider);
		await deleteAiCredential(userId, providerId);
		if (providerId === "chatgpt") {
			await db
				.delete(aiPendingConnections)
				.where(eq(aiPendingConnections.userId, userId));
		}
		revalidateAiPaths();
		return { success: true };
	} catch (error) {
		return failure(error);
	}
}

export async function startChatGptConnectionAction(): Promise<
	ActionResult<{
		userCode: string;
		verificationUrl: string;
		pollIntervalSeconds: number;
		expiresAt: string;
	}>
> {
	const userId = await getUserId();
	try {
		const code = await requestDeviceCode();
		const expiresAt = new Date(Date.now() + CHATGPT_PENDING_TTL_MS);
		const values = {
			deviceAuthId: code.deviceAuthId,
			userCode: code.userCode,
			verificationUrl: code.verificationUrl,
			pollIntervalSeconds: code.pollIntervalSeconds,
			expiresAt,
		};
		await db
			.insert(aiPendingConnections)
			.values({ userId, ...values })
			.onConflictDoUpdate({
				target: aiPendingConnections.userId,
				set: values,
			});
		return {
			success: true,
			data: {
				userCode: code.userCode,
				verificationUrl: code.verificationUrl,
				pollIntervalSeconds: code.pollIntervalSeconds,
				expiresAt: expiresAt.toISOString(),
			},
		};
	} catch (error) {
		return failure(error);
	}
}

export async function pollChatGptConnectionAction(): Promise<
	ActionResult<{
		state: "pending" | "connected" | "expired" | "disconnected";
		accountEmail?: string | null;
		planType?: string | null;
	}>
> {
	const userId = await getUserId();
	try {
		const [pending] = await db
			.select()
			.from(aiPendingConnections)
			.where(eq(aiPendingConnections.userId, userId));
		if (!pending) {
			return { success: true, data: { state: "disconnected" } };
		}

		const discardPending = () =>
			db
				.delete(aiPendingConnections)
				.where(
					and(
						eq(aiPendingConnections.userId, userId),
						eq(aiPendingConnections.deviceAuthId, pending.deviceAuthId),
					),
				);

		if (pending.expiresAt.getTime() <= Date.now()) {
			await discardPending();
			return { success: true, data: { state: "expired" } };
		}

		const result = await pollDeviceCode(pending.deviceAuthId, pending.userCode);
		if (result.state === "pending") {
			return { success: true, data: { state: "pending" } };
		}

		const tokens = await exchangeCode({
			authorizationCode: result.authorizationCode,
			codeVerifier: result.codeVerifier,
		});
		await saveChatGptCredential(userId, tokens);
		await discardPending();
		revalidateAiPaths();
		const claims = readAccessTokenClaims(tokens.accessToken);
		return {
			success: true,
			data: {
				state: "connected",
				accountEmail: claims.email,
				planType: claims.planType,
			},
		};
	} catch (error) {
		return failure(error);
	}
}

export async function cancelChatGptConnectionAction(): Promise<ActionResult> {
	const userId = await getUserId();
	try {
		await db
			.delete(aiPendingConnections)
			.where(eq(aiPendingConnections.userId, userId));
		return { success: true };
	} catch (error) {
		return failure(error);
	}
}
