import { connection } from "next/server";
import { fetchCategoriesForUser } from "@/features/categories/queries";
import { PlanningPage } from "@/features/planning/components/planning-page";
import { fetchLatestConversation } from "@/features/planning/lib/planner/conversation-store";
import { fetchPlanningSnapshot } from "@/features/planning/queries";
import { listChatGptModels } from "@/shared/lib/ai/chatgpt/models-list";
import { fetchConnectedAiProviders } from "@/shared/lib/ai/connected-providers";
import { buildModelGroups } from "@/shared/lib/ai/model-groups";
import { getUserId } from "@/shared/lib/auth/server";
import { getTodayDateString } from "@/shared/utils/date";

export default async function Page() {
	await connection();
	const userId = await getUserId();
	const [snapshot, categoryRows, plannerConversation, connectedProviders] =
		await Promise.all([
			fetchPlanningSnapshot(userId),
			fetchCategoriesForUser(userId),
			fetchLatestConversation(userId),
			fetchConnectedAiProviders(userId),
		]);
	const chatgptModels = connectedProviders.includes("chatgpt")
		? await listChatGptModels(userId)
		: [];
	const modelGroups = buildModelGroups(connectedProviders, chatgptModels);
	const expenseCategories = categoryRows
		.filter((category) => category.type === "despesa")
		.map(({ id, name }) => ({ id, name }));
	const today = getTodayDateString();

	return (
		<main className="flex flex-col gap-6">
			<PlanningPage
				snapshot={snapshot}
				today={today}
				expenseCategories={expenseCategories}
				plannerConversation={plannerConversation}
				modelGroups={modelGroups}
			/>
		</main>
	);
}
