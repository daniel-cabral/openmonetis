import { connection } from "next/server";
import { PlanningPage } from "@/features/planning/components/planning-page";
import { fetchPlanningSnapshot } from "@/features/planning/queries";
import { getUserId } from "@/shared/lib/auth/server";

export default async function Page() {
	await connection();
	const userId = await getUserId();
	const snapshot = await fetchPlanningSnapshot(userId);
	const today = new Date().toISOString().slice(0, 10);

	return (
		<main className="flex flex-col gap-6">
			<PlanningPage snapshot={snapshot} today={today} />
		</main>
	);
}
