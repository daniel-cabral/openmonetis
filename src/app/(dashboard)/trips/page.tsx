import { connection } from "next/server";
import { TripsPage } from "@/features/trips/components/trips-page";
import { fetchTripsOverview } from "@/features/trips/queries";
import { getUserId } from "@/shared/lib/auth/server";

export default async function Page() {
	await connection();
	const userId = await getUserId();
	const trips = await fetchTripsOverview(userId);

	return (
		<main className="flex flex-col gap-6">
			<TripsPage trips={trips} />
		</main>
	);
}
