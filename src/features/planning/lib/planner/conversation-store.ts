import type { UIMessage } from "ai";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { plannerConversations, plannerMessages } from "@/db/schema";
import { db } from "@/shared/lib/db";

export type StoredConversation = {
	id: string;
	title: string;
	messages: UIMessage[];
};

export async function createConversation(
	userId: string,
	title: string,
): Promise<string> {
	const [row] = await db
		.insert(plannerConversations)
		.values({ userId, title })
		.returning({ id: plannerConversations.id });
	return row.id;
}

async function readMessages(
	userId: string,
	conversationId: string,
): Promise<UIMessage[]> {
	const rows = await db
		.select()
		.from(plannerMessages)
		.where(
			and(
				eq(plannerMessages.conversationId, conversationId),
				eq(plannerMessages.userId, userId),
			),
		)
		.orderBy(asc(plannerMessages.createdAt));
	return rows.map((row) => ({
		id: row.id,
		role: row.role as UIMessage["role"],
		parts: row.parts as UIMessage["parts"],
	}));
}

export async function loadConversation(
	userId: string,
	conversationId: string,
): Promise<StoredConversation | null> {
	const [row] = await db
		.select({ id: plannerConversations.id, title: plannerConversations.title })
		.from(plannerConversations)
		.where(
			and(
				eq(plannerConversations.id, conversationId),
				eq(plannerConversations.userId, userId),
			),
		)
		.limit(1);
	if (!row) return null;
	return { ...row, messages: await readMessages(userId, row.id) };
}

export async function fetchLatestConversation(
	userId: string,
): Promise<StoredConversation | null> {
	const [row] = await db
		.select({ id: plannerConversations.id, title: plannerConversations.title })
		.from(plannerConversations)
		.where(eq(plannerConversations.userId, userId))
		.orderBy(desc(plannerConversations.updatedAt))
		.limit(1);
	if (!row) return null;
	return { ...row, messages: await readMessages(userId, row.id) };
}

export async function saveMessages(
	userId: string,
	conversationId: string,
	messages: UIMessage[],
): Promise<void> {
	// createdAt follows the array order: rows saved in one batch would otherwise share a timestamp.
	// Existing rows keep their createdAt on conflict, so later saves sort after earlier ones.
	const now = Date.now();
	await db.transaction(async (tx) => {
		await tx
			.insert(plannerMessages)
			.values(
				messages.map((message, index) => ({
					id: message.id,
					conversationId,
					userId,
					role: message.role,
					parts: message.parts,
					createdAt: new Date(now + index),
				})),
			)
			.onConflictDoUpdate({
				target: plannerMessages.id,
				set: { parts: sql`excluded.${sql.identifier(plannerMessages.parts.name)}` },
				// another user's id and stored user messages are never overwritten
				setWhere: and(
					eq(plannerMessages.role, "assistant"),
					eq(plannerMessages.userId, userId),
					eq(plannerMessages.conversationId, conversationId),
				),
			});
		await tx
			.update(plannerConversations)
			.set({ updatedAt: new Date() })
			.where(
				and(
					eq(plannerConversations.id, conversationId),
					eq(plannerConversations.userId, userId),
				),
			);
	});
}
