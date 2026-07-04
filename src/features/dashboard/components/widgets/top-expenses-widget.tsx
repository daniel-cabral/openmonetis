"use client";

import { RiArrowUpDoubleLine } from "@remixicon/react";
import { useMemo } from "react";
import { dashboardWidgetListStyles as styles } from "@/features/dashboard/components/dashboard-widget-list-styles";
import type {
	TopExpense,
	TopExpensesData,
} from "@/features/dashboard/expenses/top-expenses-queries";
import { EstablishmentLogo } from "@/shared/components/entity-avatar";
import MoneyValues from "@/shared/components/money-values";
import { WidgetEmptyState } from "@/shared/components/widgets/widget-empty-state";
import { formatTransactionDate } from "@/shared/utils/date";

type TopExpensesWidgetProps = {
	data: TopExpensesData;
};

const shouldIncludeExpense = (expense: TopExpense) => {
	const normalizedName = expense.name.trim().toLowerCase();

	if (normalizedName === "saldo inicial") {
		return false;
	}

	if (normalizedName.includes("fatura")) {
		return false;
	}

	return true;
};

export function TopExpensesWidget({ data }: TopExpensesWidgetProps) {
	const expenses = useMemo(
		() => data.expenses.filter(shouldIncludeExpense),
		[data.expenses],
	);

	return (
		<div className="flex flex-col px-0">
			{expenses.length === 0 ? (
				<WidgetEmptyState
					icon={
						<RiArrowUpDoubleLine className="size-6 text-muted-foreground" />
					}
					title="Nenhuma despesa encontrada"
					description="Quando houver despesas registradas, elas aparecerão aqui."
				/>
			) : (
				<div className="flex flex-col">
					{expenses.map((expense, index) => {
						return (
							<div key={expense.id} className={styles.row}>
								<span className={styles.rank}>{index + 1}</span>
								<div className={styles.main}>
									<EstablishmentLogo name={expense.name} size={37} />

									<div className={styles.textStack}>
										<p className={styles.title}>{expense.name}</p>
										<p className={styles.meta}>
											{formatTransactionDate(expense.purchaseDate)}
										</p>
									</div>
								</div>

								<div className={styles.trailing}>
									<MoneyValues
										className={styles.trailingValue}
										amount={expense.amount}
									/>
								</div>
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}
