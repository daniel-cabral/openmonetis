"use client";

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import type { SubcategoryOption } from "@/shared/lib/subcategories/types";
import { cn } from "@/shared/utils/ui";

// Radix Select rejects an empty string as item value, so "none" maps to null.
const NONE_VALUE = "__none__";

export function SubcategorySelect({
	id,
	options,
	value,
	onChange,
	className,
}: {
	id?: string;
	options: SubcategoryOption[];
	value: string | null | undefined;
	onChange: (value: string | null) => void;
	className?: string;
}) {
	if (options.length === 0) return null;

	return (
		<Select
			value={value ?? NONE_VALUE}
			onValueChange={(next) => onChange(next === NONE_VALUE ? null : next)}
		>
			<SelectTrigger id={id} className={cn("w-full", className)}>
				<SelectValue placeholder="Sem subcategoria" />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value={NONE_VALUE}>Sem subcategoria</SelectItem>
				{options.map((option) => (
					<SelectItem key={option.id} value={option.id}>
						{option.name}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
