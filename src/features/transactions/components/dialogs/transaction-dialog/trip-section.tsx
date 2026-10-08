"use client";

import { Label } from "@/shared/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import type { TripSectionProps } from "./transaction-dialog-types";

const NO_TRIP = "__none__";

export function TripSection({
	formState,
	onFieldChange,
	tripOptions,
	onTouched,
}: TripSectionProps) {
	return (
		<div className="space-y-1">
			<Label htmlFor="tripId">Viagem</Label>
			<Select
				value={formState.tripId ?? NO_TRIP}
				onValueChange={(value) => {
					onTouched();
					onFieldChange("tripId", value === NO_TRIP ? undefined : value);
				}}
			>
				<SelectTrigger id="tripId" className="w-full">
					<SelectValue placeholder="Nenhuma" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value={NO_TRIP}>Nenhuma</SelectItem>
					{tripOptions.map((trip) => (
						<SelectItem key={trip.id} value={trip.id}>
							{trip.name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}
