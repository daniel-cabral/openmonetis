import {
	RiDeleteBin5Line,
	RiFileCopyLine,
	RiPriceTag3Line,
} from "@remixicon/react";
import { Fragment } from "react";
import MoneyValues from "@/shared/components/money-values";
import { Button } from "@/shared/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import type { SubcategoryOption } from "@/shared/lib/subcategories/types";

type TransactionsBulkBarProps = {
	selectedCount: number;
	selectedTotal: number;
	mode: "delete" | "import";
	onAction: () => void;
	subcategoryGroups?: Array<{
		categoryId: string;
		categoryName: string;
		subcategories: SubcategoryOption[];
	}>;
	onSetSubcategory?: (subcategoryId: string | null) => void;
};

export function TransactionsBulkBar({
	selectedCount,
	selectedTotal,
	mode,
	onAction,
	subcategoryGroups,
	onSetSubcategory,
}: TransactionsBulkBarProps) {
	return (
		<div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/50 px-4 py-2">
			<div className="flex flex-col text-sm text-muted-foreground sm:flex-row sm:items-center sm:gap-2">
				<span>
					{selectedCount}{" "}
					{selectedCount === 1 ? "item selecionado" : "itens selecionados"}
				</span>
				<span className="hidden sm:inline" aria-hidden>
					-
				</span>
				<span>
					Total:{" "}
					<MoneyValues
						amount={selectedTotal}
						className="inline font-medium text-foreground"
					/>
				</span>
			</div>
			{mode === "delete" ? (
				<div className="ml-auto flex items-center gap-2">
					{onSetSubcategory && subcategoryGroups?.length ? (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button variant="outline" size="sm">
									<RiPriceTag3Line className="size-4" />
									Definir subcategoria
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								{subcategoryGroups.map((group) => (
									<Fragment key={group.categoryId}>
										<DropdownMenuLabel>{group.categoryName}</DropdownMenuLabel>
										{group.subcategories.map((subcategory) => (
											<DropdownMenuItem
												key={subcategory.id}
												onClick={() => onSetSubcategory(subcategory.id)}
											>
												{subcategory.name}
											</DropdownMenuItem>
										))}
									</Fragment>
								))}
								<DropdownMenuSeparator />
								<DropdownMenuItem onClick={() => onSetSubcategory(null)}>
									Remover subcategoria
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					) : null}
					<Button onClick={onAction} variant="destructive" size="sm">
						<RiDeleteBin5Line className="size-4" />
						Remover selecionados
					</Button>
				</div>
			) : (
				<Button
					onClick={onAction}
					variant="default"
					size="sm"
					className="ml-auto"
				>
					<RiFileCopyLine className="size-4" />
					Importar selecionados
				</Button>
			)}
		</div>
	);
}
