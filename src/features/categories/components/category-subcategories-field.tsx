"use client";

import { RiAddLine, RiDeleteBin5Line } from "@remixicon/react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { createClientSafeId } from "@/shared/utils/id";
import type { CategoryFormValues } from "./types";

type SubcategoryRow = CategoryFormValues["subcategories"][number];

interface CategorySubcategoriesFieldProps {
	value: SubcategoryRow[];
	onChange: (value: SubcategoryRow[]) => void;
	categoryName: string;
}

function formatTransactionCount(count: number) {
	return count === 1 ? "1 lançamento" : `${count} lançamentos`;
}

export function CategorySubcategoriesField({
	value,
	onChange,
	categoryName,
}: CategorySubcategoriesFieldProps) {
	const updateName = (index: number, name: string) => {
		onChange(value.map((row, i) => (i === index ? { ...row, name } : row)));
	};

	const removeRow = (index: number) => {
		onChange(value.filter((_, i) => i !== index));
	};

	const addRow = () => {
		onChange([
			...value,
			{ key: createClientSafeId(), name: "", transactionCount: 0 },
		]);
	};

	return (
		<div className="flex flex-col gap-2">
			<Label>Subcategorias (opcional)</Label>
			<div className="flex flex-col gap-2">
				{value.map((row, index) => (
					<div key={row.key} className="flex items-center gap-2">
						<Input
							value={row.name}
							onChange={(event) => updateName(index, event.target.value)}
							aria-label="Nome da subcategoria"
						/>
						{row.id && (
							<span className="w-24 shrink-0 text-xs text-muted-foreground">
								{formatTransactionCount(row.transactionCount)}
							</span>
						)}
						<Button
							type="button"
							variant="outline"
							size="icon"
							className="text-destructive hover:text-destructive"
							aria-label="Remover subcategoria"
							onClick={() => removeRow(index)}
						>
							<RiDeleteBin5Line />
						</Button>
					</div>
				))}
			</div>
			<Button
				type="button"
				variant="outline"
				className="border-dashed"
				onClick={addRow}
			>
				<RiAddLine />
				Adicionar subcategoria
			</Button>
			<p className="text-xs text-muted-foreground">
				{`Excluir uma subcategoria não apaga lançamentos: eles ficam em ${categoryName || "a categoria"}, sem subcategoria.`}
			</p>
		</div>
	);
}
