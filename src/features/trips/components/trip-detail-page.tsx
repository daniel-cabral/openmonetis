"use client";

import { RiDeleteBinLine, RiPencilLine } from "@remixicon/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deleteTripAction } from "@/features/trips/actions";
import type { TripDetail } from "@/features/trips/queries";
import { ConfirmActionDialog } from "@/shared/components/confirm-action-dialog";
import { Button } from "@/shared/components/ui/button";
import { formatDateOnly } from "@/shared/utils/date";
import { TripBreakdowns } from "./trip-breakdowns";
import { TripDialog } from "./trip-dialog";
import { TripSuggestions } from "./trip-suggestions";
import { TripSummaryCards } from "./trip-summary-cards";
import { TripTransactionsList } from "./trip-transactions-list";

type TripDetailPageProps = {
	detail: TripDetail;
};

export function TripDetailPage({ detail }: TripDetailPageProps) {
	const router = useRouter();
	const { trip } = detail;

	const handleDelete = async () => {
		const result = await deleteTripAction({ id: trip.id });
		if (!result.success) {
			toast.error(result.error);
			return;
		}
		toast.success(result.message);
		router.push("/trips");
	};

	return (
		<div className="space-y-6">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h2 className="text-xl font-semibold">{trip.name}</h2>
					<p className="text-sm text-muted-foreground">
						{formatDateOnly(trip.startDate)} a {formatDateOnly(trip.endDate)}
					</p>
					{trip.note ? <p className="mt-1 text-sm">{trip.note}</p> : null}
				</div>
				<div className="flex gap-2">
					<TripDialog
						mode="update"
						trip={trip}
						trigger={
							<Button variant="outline" size="sm">
								<RiPencilLine className="size-4" />
								Editar
							</Button>
						}
					/>
					<ConfirmActionDialog
						title="Excluir viagem?"
						description="Os lançamentos continuam existindo, só deixam de pertencer a esta viagem."
						confirmLabel="Excluir"
						confirmVariant="destructive"
						onConfirm={handleDelete}
						trigger={
							<Button variant="outline" size="sm">
								<RiDeleteBinLine className="size-4" />
								Excluir
							</Button>
						}
					/>
				</div>
			</div>

			<TripSummaryCards summary={detail.summary} />
			<TripBreakdowns summary={detail.summary} />

			<TripTransactionsList rows={detail.linked} />
			<TripSuggestions tripId={trip.id} rows={detail.suggestions} />
		</div>
	);
}
