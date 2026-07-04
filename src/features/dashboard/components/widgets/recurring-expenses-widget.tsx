import { RiRefreshLine } from "@remixicon/react";
import { dashboardWidgetListStyles as styles } from "@/features/dashboard/components/dashboard-widget-list-styles";
import type { RecurringExpensesData } from "@/features/dashboard/expenses/recurring-expenses-queries";
import { EstablishmentLogo } from "@/shared/components/entity-avatar";
import MoneyValues from "@/shared/components/money-values";
import { WidgetEmptyState } from "@/shared/components/widgets/widget-empty-state";
import { getPaymentMethodIcon } from "@/shared/utils/icons";

type RecurringExpensesWidgetProps = {
	data: RecurringExpensesData;
};

const formatOccurrences = (value: number | null) => {
	if (!value) {
		return "Repete mensalmente";
	}

	return `Repete por ${value} ${value === 1 ? "mês" : "meses"}`;
};

export function RecurringExpensesWidget({
	data,
}: RecurringExpensesWidgetProps) {
	if (data.expenses.length === 0) {
		return (
			<WidgetEmptyState
				icon={<RiRefreshLine className="size-6 text-muted-foreground" />}
				title="Nenhuma despesa recorrente encontrada"
				description="Lançamentos recorrentes aparecerão aqui conforme forem registrados."
			/>
		);
	}

	return (
		<div className="flex flex-col">
			{[...data.expenses]
				.sort((a, b) => b.amount - a.amount)
				.map((expense) => {
					return (
						<div key={expense.id} className={styles.row}>
							<div className={styles.main}>
								<EstablishmentLogo name={expense.name} size={37} />

								<div className={styles.textStack}>
									<p className={styles.title}>{expense.name}</p>
									<div className={styles.meta}>
										<span className="inline-flex min-w-0 items-center gap-1 [&_svg]:size-3.5">
											{getPaymentMethodIcon(expense.paymentMethod)}
											{expense.paymentMethod}
										</span>
										<span>{formatOccurrences(expense.recurrenceCount)}</span>
									</div>
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
	);
}
