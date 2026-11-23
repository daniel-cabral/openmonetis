"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setPlanCategoryMappingsAction } from "@/features/planning/actions";
import type { PlanView } from "@/features/planning/lib/snapshot-types";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Label } from "@/shared/components/ui/label";

export function CategoryMappingField({
	plan,
	categories,
}: {
	plan: PlanView;
	categories: { id: string; name: string }[];
}) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [selectedIds, setSelectedIds] = useState<string[]>(plan.categoryIds);

	const toggle = (categoryId: string, checked: boolean) =>
		setSelectedIds((current) =>
			checked
				? [...current, categoryId]
				: current.filter((id) => id !== categoryId),
		);

	const handleSave = () => {
		startTransition(async () => {
			const result = await setPlanCategoryMappingsAction({
				planId: plan.id,
				categoryIds: selectedIds,
			});

			if (result.success) {
				toast.success(result.message);
				router.refresh();
				return;
			}

			toast.error(result.error);
		});
	};

	return (
		<div className="space-y-3">
			<div className="space-y-1">
				<p className="text-sm font-medium">Categorias deste plano</p>
				<p className="text-xs text-muted-foreground">
					Saem do custo de vida e entram como saída do plano.
				</p>
			</div>
			{categories.length === 0 ? (
				<p className="text-sm text-muted-foreground">
					Nenhuma categoria de despesa.
				</p>
			) : (
				<div className="grid gap-2 sm:grid-cols-2">
					{categories.map((category) => (
						<div key={category.id} className="flex items-center gap-2">
							<Checkbox
								id={`plan-category-${category.id}`}
								checked={selectedIds.includes(category.id)}
								onCheckedChange={(checked) =>
									toggle(category.id, checked === true)
								}
							/>
							<Label htmlFor={`plan-category-${category.id}`}>
								{category.name}
							</Label>
						</div>
					))}
				</div>
			)}
			<div className="flex justify-end">
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={handleSave}
					disabled={isPending}
				>
					{isPending ? "Salvando..." : "Salvar categorias"}
				</Button>
			</div>
		</div>
	);
}
