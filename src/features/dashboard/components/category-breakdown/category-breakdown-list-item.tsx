import Link from "next/link";
import type { DashboardCategoryBreakdownItem } from "@/features/dashboard/categories/category-breakdown-helpers";
import { dashboardWidgetListStyles as styles } from "@/features/dashboard/components/dashboard-widget-list-styles";
import { PercentageChangeIndicator } from "@/features/dashboard/components/percentage-change-indicator";
import { CategoryIconBadge } from "@/shared/components/entity-avatar";
import MoneyValues from "@/shared/components/money-values";
import { formatCurrency } from "@/shared/utils/currency";
import { formatPercentage as formatPercentageValue } from "@/shared/utils/percentage";

type CategoryBreakdownListItemConfig = {
	shareLabel: string;
	percentageDigits: number;
	positiveTrend: "up" | "down";
	showBudget: boolean;
};

type CategoryBreakdownListItemProps = {
	category: DashboardCategoryBreakdownItem;
	periodParam: string;
	config: CategoryBreakdownListItemConfig;
	position: number;
};

const formatPercentage = (value: number, digits: number) =>
	formatPercentageValue(value, {
		minimumFractionDigits: digits,
		maximumFractionDigits: digits,
		absolute: true,
	});

export function CategoryBreakdownListItem({
	category,
	periodParam,
	config,
	position,
}: CategoryBreakdownListItemProps) {
	const hasBudget = config.showBudget && category.budgetAmount !== null;
	const budgetExceeded =
		hasBudget &&
		category.budgetUsedPercentage !== null &&
		category.budgetUsedPercentage > 100;
	const exceededAmount =
		budgetExceeded && category.budgetAmount
			? category.currentAmount - category.budgetAmount
			: 0;

	return (
		<div>
			<div className={styles.row}>
				<span className={styles.rank}>{position}</span>
				<div className={styles.main}>
					<CategoryIconBadge
						icon={category.categoryIcon}
						name={category.categoryName}
					/>
					<div className={styles.textStack}>
						<div className="flex items-center gap-2">
							<Link
								href={`/categories/${category.categoryId}?periodo=${periodParam}`}
								className={styles.titleLink}
							>
								<span className="truncate">{category.categoryName}</span>
							</Link>
						</div>
						<div className={styles.meta}>
							<span>
								{formatPercentage(
									category.percentageOfTotal,
									config.percentageDigits,
								)}{" "}
								da {config.shareLabel}
							</span>
						</div>
						{hasBudget && category.budgetUsedPercentage !== null ? (
							<div
								className={`mt-0.5 text-xs ${budgetExceeded ? "text-destructive" : "text-info"}`}
							>
								{budgetExceeded ? (
									<>
										Limite excedido em{" "}
										<span className="font-medium">
											{formatCurrency(exceededAmount)}
										</span>
									</>
								) : (
									<>
										{formatPercentage(
											category.budgetUsedPercentage,
											config.percentageDigits,
										)}{" "}
										do limite utilizado
									</>
								)}
							</div>
						) : null}
					</div>
				</div>

				<div className={styles.trailing}>
					<MoneyValues
						className={styles.trailingValue}
						amount={category.currentAmount}
					/>
					{category.percentageChange !== null ? (
						<span className={`${styles.trailingMeta} text-muted-foreground`}>
							<PercentageChangeIndicator
								value={category.percentageChange}
								label={formatPercentage(
									category.percentageChange,
									config.percentageDigits,
								)}
								positiveTrend={config.positiveTrend}
							/>
							<span>vs. mês ant.</span>
						</span>
					) : null}
				</div>
			</div>
		</div>
	);
}
