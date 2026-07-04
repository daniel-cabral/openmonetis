import Link from "next/link";
import type { ReactNode } from "react";
import { dashboardWidgetListStyles as styles } from "@/features/dashboard/components/dashboard-widget-list-styles";
import {
	formatPaymentBreakdownPercentage,
	formatPaymentBreakdownTransactionsLabel,
} from "@/features/dashboard/payments/payment-breakdown-formatters";
import MoneyValues from "@/shared/components/money-values";
import { Progress } from "@/shared/components/ui/progress";
import {
	getCategoryBgColorFromName,
	getCategoryColorFromName,
} from "@/shared/utils/category-colors";

export type PaymentBreakdownListItemData = {
	id: string;
	title: string;
	icon: ReactNode;
	amount: number;
	transactions: number;
	percentage: number;
	href?: string;
};

type PaymentBreakdownListItemProps = {
	item: PaymentBreakdownListItemData;
	position: number;
};

export function PaymentBreakdownListItem({
	item,
	position,
}: PaymentBreakdownListItemProps) {
	return (
		<div className={styles.row}>
			<span className={styles.rank}>{position}</span>
			<div
				className="flex size-9.5 shrink-0 items-center justify-center rounded-full"
				style={{
					backgroundColor: getCategoryBgColorFromName(item.id),
					color: getCategoryColorFromName(item.id),
				}}
			>
				{item.icon}
			</div>

			<div className={styles.textStack}>
				<div className="flex items-center justify-between gap-2">
					{item.href ? (
						<Link href={item.href} className={styles.titleLink}>
							<span className="truncate">{item.title}</span>
						</Link>
					) : (
						<p className={styles.title}>{item.title}</p>
					)}
					<MoneyValues
						className={`shrink-0 ${styles.trailingValue}`}
						amount={item.amount}
					/>
				</div>

				<div className={styles.meta}>
					<span>
						{formatPaymentBreakdownTransactionsLabel(item.transactions)}
					</span>
					<span className="ml-auto">
						{formatPaymentBreakdownPercentage(item.percentage)} do total
					</span>
				</div>

				<div className="mt-1">
					<Progress value={item.percentage} />
				</div>
			</div>
		</div>
	);
}
