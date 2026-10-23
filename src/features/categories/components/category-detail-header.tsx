import Link from "next/link";
import type { SubcategoryBreakdownRow } from "@/features/categories/lib/subcategory-breakdown";
import { PercentageChangeIndicator } from "@/features/dashboard/components/percentage-change-indicator";
import { CategoryIconBadge } from "@/shared/components/entity-avatar";
import { TransactionTypeBadge } from "@/shared/components/transaction-type-badge";
import { Card } from "@/shared/components/ui/card";
import type { CategoryType } from "@/shared/lib/categories/constants";
import { currencyFormatter } from "@/shared/utils/currency";
import { formatPercentage } from "@/shared/utils/percentage";
import { cn } from "@/shared/utils/ui";

type CategorySummary = {
	id: string;
	name: string;
	icon: string | null;
	type: CategoryType;
};

type CategoryDetailHeaderProps = {
	category: CategorySummary;
	currentPeriodLabel: string;
	previousPeriodLabel: string;
	currentTotal: number;
	previousTotal: number;
	percentageChange: number | null;
	transactionCount: number;
	subcategoryRows?: Array<
		SubcategoryBreakdownRow & { href: string; active: boolean }
	>;
};

export function CategoryDetailHeader({
	category,
	currentPeriodLabel,
	previousPeriodLabel,
	currentTotal,
	previousTotal,
	percentageChange,
	transactionCount,
	subcategoryRows,
}: CategoryDetailHeaderProps) {
	const absoluteChange = currentTotal - previousTotal;
	const variationLabel =
		typeof percentageChange === "number"
			? formatPercentage(percentageChange, {
					minimumFractionDigits: 1,
					maximumFractionDigits: 1,
					absolute: true,
				})
			: "—";
	const hasComparison = typeof percentageChange === "number";
	const isFlat = absoluteChange === 0;
	const changeDirection =
		absoluteChange > 0 ? "increase" : absoluteChange < 0 ? "decrease" : "flat";
	const comparisonTone =
		isFlat || !hasComparison
			? "neutral"
			: category.type === "receita"
				? changeDirection === "increase"
					? "positive"
					: "negative"
				: changeDirection === "decrease"
					? "positive"
					: "negative";
	const statusLabel = !hasComparison
		? "Sem comparação"
		: isFlat
			? "Estável"
			: changeDirection === "increase"
				? "Aumento"
				: "Queda";

	return (
		<Card className="px-5 py-5">
			<div className="flex flex-col gap-5">
				<div className="flex items-start gap-3">
					<CategoryIconBadge
						icon={category.icon}
						name={category.name}
						size="lg"
					/>
					<div className="space-y-2">
						<h1 className="text-xl font-semibold leading-tight">
							{category.name}
						</h1>
						<div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
							<TransactionTypeBadge kind={category.type} />
							<span>
								{transactionCount}{" "}
								{transactionCount === 1 ? "lançamento" : "lançamentos"} em{" "}
								{currentPeriodLabel}
							</span>
						</div>
					</div>
				</div>

				<div className="grid gap-3 md:grid-cols-3">
					<div className="rounded-lg border p-3">
						<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
							Total em {currentPeriodLabel}
						</p>
						<p className="mt-1 text-3xl font-semibold tracking-tight">
							{currencyFormatter.format(currentTotal)}
						</p>
					</div>

					<div className="rounded-lg border p-3">
						<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
							Total em {previousPeriodLabel}
						</p>
						<p className="mt-1 text-2xl font-semibold tracking-tight text-muted-foreground">
							{currencyFormatter.format(previousTotal)}
						</p>
					</div>

					<div className="rounded-lg border p-3">
						<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
							Variação
						</p>
						<div className="mt-2 flex flex-wrap items-center gap-2">
							<span
								className={cn(
									"inline-flex h-6 items-center rounded-sm border px-2 text-xs font-medium",
									comparisonTone === "positive" &&
										"border-success/30 bg-success/5 text-success",
									comparisonTone === "negative" &&
										"border-destructive/30 bg-destructive/5 text-destructive",
									comparisonTone === "neutral" &&
										"border-muted-foreground/30 bg-muted/30 text-muted-foreground",
								)}
							>
								{statusLabel}
							</span>
							<PercentageChangeIndicator
								value={percentageChange}
								label={variationLabel}
								positiveTrend={category.type === "receita" ? "up" : "down"}
								className="gap-1 text-lg font-semibold"
								iconClassName="size-4"
								showFlatIcon
							/>
						</div>
					</div>
				</div>

				{subcategoryRows && subcategoryRows.length > 0 && (
					<div>
						<p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
							Por subcategoria
						</p>
						<div className="flex flex-col gap-1">
							{subcategoryRows.map((row) => {
								const isNone = row.subcategoryId === null;
								return (
									<Link
										key={row.subcategoryId ?? "sem-subcategoria"}
										href={row.href}
										className={cn(
											"grid grid-cols-[8rem_1fr_6rem_3.5rem] items-center gap-3 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/50 sm:grid-cols-[10rem_1fr_7rem_4rem]",
											row.active && "bg-muted ring-1 ring-primary/40",
											isNone && "italic text-muted-foreground",
										)}
									>
										<span className="truncate">{row.name}</span>
										<span className="h-2 overflow-hidden rounded-full bg-muted">
											<span
												className={cn(
													"block h-full rounded-full",
													isNone ? "bg-primary/40" : "bg-primary",
												)}
												style={{ width: `${row.percent}%` }}
											/>
										</span>
										<span className="text-right">
											{currencyFormatter.format(row.amount)}
										</span>
										<span className="text-right text-muted-foreground">
											{formatPercentage(row.percent, {
												minimumFractionDigits: 1,
												maximumFractionDigits: 1,
											})}
										</span>
									</Link>
								);
							})}
						</div>
					</div>
				)}
			</div>
		</Card>
	);
}
