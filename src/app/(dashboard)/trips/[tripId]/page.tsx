import { notFound } from "next/navigation";
import { connection } from "next/server";
import { TripDetailPage } from "@/features/trips/components/trip-detail-page";
import { fetchTripDetail } from "@/features/trips/queries";
import { getUserId } from "@/shared/lib/auth/server";

type PageProps = {
	params: Promise<{ tripId: string }>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function Page({ params }: PageProps) {
	await connection();
	const { tripId } = await params;
	if (!UUID.test(tripId)) notFound();

	const userId = await getUserId();
	const detail = await fetchTripDetail(userId, tripId);
	if (!detail) notFound();

	return (
		<main className="flex flex-col gap-6">
			<TripDetailPage detail={detail} />
		</main>
	);
}
