import { and, eq, sql } from "drizzle-orm";
import { aiCredentials } from "@/db/schema";
import { db } from "@/shared/lib/db";
import { decryptSecret, encryptSecret } from "../credentials/cipher";
import {
	AiCredentialInvalidError,
	AiCredentialKeyError,
	AiCredentialMissingError,
	AiReconnectRequiredError,
} from "../credentials/errors";
import { CHATGPT_REFRESH_MARGIN_MS } from "./constants";
import {
	type ChatGptTokens,
	readAccessTokenClaims,
	refreshTokens,
} from "./oauth";

const PROVIDER = "chatgpt";

type Database = typeof db;

export type ChatGptAccessToken = { accessToken: string; accountId: string };

export type ChatGptCredentialDependencies = {
	database?: Database;
	secret?: string;
	now?: () => Date;
	refresh?: (refreshToken: string) => Promise<ChatGptTokens>;
};

type StoredTokens = { accessToken: string; refreshToken: string };

function isFresh(expiresAt: Date, now: Date): boolean {
	return expiresAt.getTime() - now.getTime() >= CHATGPT_REFRESH_MARGIN_MS;
}

function scopeOf(userId: string) {
	return and(
		eq(aiCredentials.userId, userId),
		eq(aiCredentials.provider, PROVIDER),
	);
}

function deriveExpiry(tokens: ChatGptTokens, now: Date): Date {
	try {
		return readAccessTokenClaims(tokens.accessToken).expiresAt;
	} catch {
		return new Date(now.getTime() + tokens.expiresIn * 1000);
	}
}

export async function saveChatGptCredential(
	userId: string,
	tokens: ChatGptTokens,
	deps: Pick<ChatGptCredentialDependencies, "database" | "secret"> = {},
): Promise<void> {
	const database = deps.database ?? db;
	const claims = readAccessTokenClaims(tokens.accessToken);
	const values = {
		status: "connected" as const,
		encryptedSecret: encryptSecret(
			{ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken },
			deps.secret,
		),
		secretMask: null,
		baseUrl: null,
		accountId: claims.accountId,
		accountEmail: claims.email,
		planType: claims.planType,
		accessExpiresAt: claims.expiresAt,
		refreshedAt: null,
	};
	await database
		.insert(aiCredentials)
		.values({ userId, provider: PROVIDER, ...values })
		.onConflictDoUpdate({
			target: [aiCredentials.userId, aiCredentials.provider],
			set: { ...values, updatedAt: sql`now()` },
		});
}

export async function markChatGptNeedsReconnect(
	userId: string,
	deps: Pick<ChatGptCredentialDependencies, "database"> = {},
): Promise<void> {
	const database = deps.database ?? db;
	await database
		.update(aiCredentials)
		.set({ status: "needs_reconnect", updatedAt: sql`now()` })
		.where(scopeOf(userId));
}

async function markInvalidSecret(
	userId: string,
	database: Database,
): Promise<void> {
	await database
		.update(aiCredentials)
		.set({ status: "invalid_secret", updatedAt: sql`now()` })
		.where(scopeOf(userId));
}

function assertUsable(row: { status: string } | undefined): void {
	if (!row) {
		throw new AiCredentialMissingError(PROVIDER);
	}
	if (row.status === "needs_reconnect") {
		throw new AiReconnectRequiredError(PROVIDER);
	}
	if (row.status === "invalid_secret") {
		throw new AiCredentialInvalidError(PROVIDER);
	}
}

async function refreshUnderLock(
	userId: string,
	database: Database,
	secret: string | undefined,
	now: Date,
	refresh: (refreshToken: string) => Promise<ChatGptTokens>,
): Promise<ChatGptAccessToken> {
	return database.transaction(async (tx) => {
		const [row] = await tx
			.select()
			.from(aiCredentials)
			.where(scopeOf(userId))
			.for("update");
		assertUsable(row);
		const stored = decryptSecret<StoredTokens>(row.encryptedSecret, secret);
		if (row.accessExpiresAt && isFresh(row.accessExpiresAt, now)) {
			return {
				accessToken: stored.accessToken,
				accountId:
					row.accountId ?? readAccessTokenClaims(stored.accessToken).accountId,
			};
		}
		const next = await refresh(stored.refreshToken);
		await tx
			.update(aiCredentials)
			.set({
				encryptedSecret: encryptSecret(
					{ accessToken: next.accessToken, refreshToken: next.refreshToken },
					secret,
				),
				accessExpiresAt: deriveExpiry(next, now),
				refreshedAt: now,
				updatedAt: now,
			})
			.where(scopeOf(userId));
		return {
			accessToken: next.accessToken,
			accountId:
				row.accountId ?? readAccessTokenClaims(next.accessToken).accountId,
		};
	});
}

export async function getChatGptAccessToken(
	userId: string,
	deps: ChatGptCredentialDependencies = {},
): Promise<ChatGptAccessToken> {
	const now = (deps.now ?? (() => new Date()))();
	const database = deps.database ?? db;
	const refresh =
		deps.refresh ?? ((refreshToken) => refreshTokens(refreshToken));

	try {
		const [row] = await database
			.select()
			.from(aiCredentials)
			.where(scopeOf(userId));
		assertUsable(row);
		if (row.accessExpiresAt && isFresh(row.accessExpiresAt, now)) {
			const stored = decryptSecret<StoredTokens>(
				row.encryptedSecret,
				deps.secret,
			);
			return {
				accessToken: stored.accessToken,
				accountId:
					row.accountId ?? readAccessTokenClaims(stored.accessToken).accountId,
			};
		}
		return await refreshUnderLock(userId, database, deps.secret, now, refresh);
	} catch (error) {
		if (error instanceof AiReconnectRequiredError) {
			await markChatGptNeedsReconnect(userId, { database });
		}
		if (error instanceof AiCredentialKeyError) {
			await markInvalidSecret(userId, database);
			throw new AiCredentialInvalidError(PROVIDER);
		}
		throw error;
	}
}
