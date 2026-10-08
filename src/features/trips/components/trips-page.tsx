"use client";

import { RiAddLine, RiPlaneLine } from "@remixicon/react";
import Link from "next/link";
import type { TripListItem } from "@/features/trips/queries";
import { EmptyState } from "@/shared/components/feedback/empty-state";
import { Button } from "@/shared/components/ui/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/shared/components/ui/card";
import { formatCurrency } from "@/shared/utils/currency";
import { formatDateOnly } from "@/shared/utils/date";
import { TripDialog } from "./trip-dialog";

const SHORT_DATE = { day: "2-digit", month: "short" } as const;

export function TripsPage({ trips }: { trips: TripListItem[] }) {
	const newTripButton = (
		<TripDialog
			mode="create"
			trigger={
				<Button>
					<RiAddLine className="size-4" />
					Nova viagem
				</Button>
			}
		/>
	);

	if (trips.length === 0) {
		return (
			<EmptyState
				media={<RiPlaneLine />}
				mediaVariant="icon"
				title="Nenhuma viagem ainda"
				description="Crie uma viagem para juntar os gastos dela em um só lugar."
			>
				{newTripButton}
			</EmptyState>
		);
	}

	return (
		<div className="space-y-4">
			<div className="flex justify-end">{newTripButton}</div>
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{trips.map((trip) => (
					<Link key={trip.id} href={`/trips/${trip.id}`} className="block">
						<Card className="h-full transition-colors hover:border-primary/50">
							<CardHeader>
								<CardTitle>{trip.name}</CardTitle>
								<p className="text-sm text-muted-foreground">
									{formatDateOnly(trip.startDate, SHORT_DATE)} a{" "}
									{formatDateOnly(trip.endDate)}
								</p>
							</CardHeader>
							<CardContent className="flex items-end justify-between">
								<span className="text-sm text-muted-foreground">
									{trip.linkedCount} lançamento(s)
								</span>
								<span className="text-lg font-semibold">
									{formatCurrency(trip.netCost)}
								</span>
							</CardContent>
						</Card>
					</Link>
				))}
			</div>
		</div>
	);
}
