import { and, eq, sql } from "drizzle-orm";
import { aiCredentials } from "@/db/schema";
import { db } from "@/shared/lib/db";
import type { AiProviderId } from "../models";
import { decryptSecret, encryptSecret } from "./cipher";
import {
	AiCredentialInvalidError,
	AiCredentialKeyError,
	AiCredentialMissingError,
	AiReconnectRequiredError,
} from "./errors";
import { maskApiKey } from "./mask";

type Database = typeof db;

export type AiCredentialStatus = {
	provider: AiProviderId;
	status: "connected" | "needs_reconnect" | "invalid_secret";
	secretMask: string | null;
	baseUrl: string | null;
	accountEmail: string | null;
	planType: string | null;
};

export type ApiKeyCredentialInput =
	| {
			provider: Exclude<AiProviderId, "chatgpt" | "ollama">;
			apiKey: string;
	  }
	| { provider: "ollama"; baseUrl: string; apiKey?: string };

export type AiCredentialDependencies = {
	database?: Database;
	secret?: string;
};

type StoredPayload = { apiKey?: string };

export async function listAiCredentialStatuses(
	userId: string,
	deps: Pick<AiCredentialDependencies, "database"> = {},
): Promise<AiCredentialStatus[]> {
	const database = deps.database ?? db;
	const rows = await database
		.select({
			provider: aiCredentials.provider,
			status: aiCredentials.status,
			secretMask: aiCredentials.secretMask,
			baseUrl: aiCredentials.baseUrl,
			accountEmail: aiCredentials.accountEmail,
			planType: aiCredentials.planType,
		})
		.from(aiCredentials)
		.where(eq(aiCredentials.userId, userId));
	return rows as AiCredentialStatus[];
}

export async function saveApiKeyCredential(
	userId: string,
	input: ApiKeyCredentialInput,
	deps: AiCredentialDependencies = {},
): Promise<AiCredentialStatus> {
	const database = deps.database ?? db;
	const apiKey = input.apiKey?.trim() || undefined;
	const values = {
		status: "connected" as const,
		encryptedSecret: encryptSecret(apiKey ? { apiKey } : {}, deps.secret),
		secretMask: apiKey ? maskApiKey(apiKey) : null,
		baseUrl: input.provider === "ollama" ? input.baseUrl : null,
		accountId: null,
		accountEmail: null,
		planType: null,
		accessExpiresAt: null,
		refreshedAt: null,
	};
	await database
		.insert(aiCredentials)
		.values({ userId, provider: input.provider, ...values })
		.onConflictDoUpdate({
			target: [aiCredentials.userId, aiCredentials.provider],
			set: { ...values, updatedAt: sql`now()` },
		});
	return {
		provider: input.provider,
		status: "connected",
		secretMask: values.secretMask,
		baseUrl: values.baseUrl,
		accountEmail: null,
		planType: null,
	};
}

export async function getProviderSecret(
	userId: string,
	provider: AiProviderId,
	deps: AiCredentialDependencies = {},
): Promise<{ apiKey?: string; baseUrl?: string }> {
	const database = deps.database ?? db;
	const scope = and(
		eq(aiCredentials.userId, userId),
		eq(aiCredentials.provider, provider),
	);
	const [row] = await database.select().from(aiCredentials).where(scope);
	if (!row) {
		throw new AiCredentialMissingError(provider);
	}
	if (row.status === "needs_reconnect") {
		throw new AiReconnectRequiredError(provider);
	}
	if (row.status === "invalid_secret") {
		throw new AiCredentialInvalidError(provider);
	}
	try {
		const payload = decryptSecret<StoredPayload>(
			row.encryptedSecret,
			deps.secret,
		);
		return {
			...(payload.apiKey ? { apiKey: payload.apiKey } : {}),
			...(row.baseUrl ? { baseUrl: row.baseUrl } : {}),
		};
	} catch (error) {
		if (error instanceof AiCredentialKeyError) {
			await database
				.update(aiCredentials)
				.set({ status: "invalid_secret", updatedAt: sql`now()` })
				.where(scope);
			throw new AiCredentialInvalidError(provider);
		}
		throw error;
	}
}

export async function deleteAiCredential(
	userId: string,
	provider: AiProviderId,
	deps: Pick<AiCredentialDependencies, "database"> = {},
): Promise<void> {
	const database = deps.database ?? db;
	await database
		.delete(aiCredentials)
		.where(
			and(
				eq(aiCredentials.userId, userId),
				eq(aiCredentials.provider, provider),
			),
		);
}
