import { connection } from "next/server";
import { fetchCategoriesForUser } from "@/features/categories/queries";
import { PlanningPage } from "@/features/planning/components/planning-page";
import { fetchLatestConversation } from "@/features/planning/lib/planner/conversation-store";
import { fetchPlanningSnapshot } from "@/features/planning/queries";
import { getUserId } from "@/shared/lib/auth/server";

export default async function Page() {
	await connection();
	const userId = await getUserId();
	const [snapshot, categoryRows, plannerConversation] = await Promise.all([
		fetchPlanningSnapshot(userId),
		fetchCategoriesForUser(userId),
		fetchLatestConversation(userId),
	]);
	const expenseCategories = categoryRows
		.filter((category) => category.type === "despesa")
		.map(({ id, name }) => ({ id, name }));
	const today = new Date().toISOString().slice(0, 10);

	return (
		<main className="flex flex-col gap-6">
			<PlanningPage
				snapshot={snapshot}
				today={today}
				expenseCategories={expenseCategories}
				plannerConversation={plannerConversation}
			/>
		</main>
	);
}
