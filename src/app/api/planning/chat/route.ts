import { NextResponse } from "next/server";
import { z } from "zod";
import { CONTRIBUTION_CATEGORY_NAME } from "@/features/planning/lib/baseline";
import { runProjection } from "@/features/planning/lib/engine";
import { buildPlannerContext } from "@/features/planning/lib/planner/context";
import {
	loadConversation,
	saveMessages,
} from "@/features/planning/lib/planner/conversation-store";
import { createPlannerResponse } from "@/features/planning/lib/planner/stream";
import { buildSystemPrompt } from "@/features/planning/lib/planner/system-prompt";
import { buildPlannerTools } from "@/features/planning/lib/planner/tools";
import { fetchCategoryTotals } from "@/features/planning/lib/queries/category-totals";
import { fetchPlanningSnapshot } from "@/features/planning/queries";
import { resolveLanguageModel } from "@/shared/lib/ai/model-provider";
import { resolveWebSearchTools } from "@/shared/lib/ai/web-search";
import { getOptionalUserSession } from "@/shared/lib/auth/server";
import { getAdminPayerId } from "@/shared/lib/payers/get-admin-id";

export const maxDuration = 60;

const chatBodySchema = z.object({
	conversationId: z.uuid(),
	modelId: z.string().min(1),
	message: z.object({
		id: z.string().min(1),
		role: z.literal("user"),
		parts: z
			.array(z.object({ type: z.literal("text"), text: z.string() }))
			.min(1),
	}),
});

export async function POST(request: Request) {
	const session = await getOptionalUserSession();
	const userId = session?.user?.id;
	if (!userId) {
		return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
	}

	const body = chatBodySchema.safeParse(await request.json().catch(() => null));
	if (!body.success) {
		return NextResponse.json({ error: "Requisição inválida" }, { status: 400 });
	}
	const { conversationId, modelId, message } = body.data;

	try {
		const conversation = await loadConversation(userId, conversationId);
		if (!conversation) {
			return NextResponse.json(
				{ error: "Conversa não encontrada" },
				{ status: 404 },
			);
		}

		if (conversation.messages.some((stored) => stored.id === message.id)) {
			return NextResponse.json(
				{ error: "Requisição inválida" },
				{ status: 400 },
			);
		}

		const model = resolveLanguageModel(modelId);
		if (!model.success) {
			return NextResponse.json({ error: model.error }, { status: 400 });
		}

		const snapshot = await fetchPlanningSnapshot(userId);
		const projection = runProjection(snapshot.input);
		const context = buildPlannerContext(snapshot, projection);
		const webSearch = resolveWebSearchTools(modelId);
		const adminPayerId = await getAdminPayerId(userId);

		return await createPlannerResponse({
			model: model.model,
			system: buildSystemPrompt(context, {
				webSearch: Object.keys(webSearch).length > 0,
			}),
			history: [...conversation.messages, message],
			tools: buildPlannerTools({
				input: snapshot.input,
				plannedContribution: snapshot.settings.plannedContribution,
				excludedCategoryIds: new Set(
					snapshot.plans.flatMap((plan) => plan.categoryIds),
				),
				loadCategoryTotals: (from, to) =>
					adminPayerId
						? fetchCategoryTotals(userId, adminPayerId, from, to).then(
								(totals) =>
									totals.filter(
										(total) =>
											total.categoryName !== CONTRIBUTION_CATEGORY_NAME,
									),
							)
						: Promise.resolve([]),
				webSearch,
			}),
			onFinish: (messages) => saveMessages(userId, conversationId, messages),
		});
	} catch (error) {
		console.error("planning chat failed", error);
		return NextResponse.json({ error: "Algo deu errado" }, { status: 500 });
	}
}
