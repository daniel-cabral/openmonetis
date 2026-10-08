"use client";

import {
	Select,
	SelectContent,
	SelectItem,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import type { TripOption } from "@/shared/lib/trips/queries";
import { TRIP_FILTER_NONE_VALUE } from "@/shared/lib/trips/trip-filter-param";

// Radix Select does not accept "" as an item value.
const ALL_VALUE = "todos";

type TripFilterSelectProps = {
	trips: TripOption[];
	value: string | null;
	onChange: (value: string | null) => void;
	disabled?: boolean;
};

export function TripFilterSelect({
	trips,
	value,
	onChange,
	disabled = false,
}: TripFilterSelectProps) {
	return (
		<Select
			value={value ?? ALL_VALUE}
			onValueChange={(next) => onChange(next === ALL_VALUE ? null : next)}
			disabled={disabled}
		>
			<SelectTrigger
				aria-label="Filtrar por viagem"
				className="w-full md:w-[200px] text-sm border-dashed"
			>
				<SelectValue placeholder="Viagem" />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value={ALL_VALUE}>Todos os lançamentos</SelectItem>
				<SelectItem value={TRIP_FILTER_NONE_VALUE}>Sem viagens</SelectItem>
				{trips.length > 0 ? <SelectSeparator /> : null}
				{trips.map((trip) => (
					<SelectItem key={trip.id} value={trip.id}>
						{trip.name}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
