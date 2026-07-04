"use client";

import { RiGroupLine, RiVerifiedBadgeFill } from "@remixicon/react";
import Link from "next/link";
import { dashboardWidgetListStyles as styles } from "@/features/dashboard/components/dashboard-widget-list-styles";
import { PercentageChangeIndicator } from "@/features/dashboard/components/percentage-change-indicator";
import type { DashboardPagador } from "@/features/dashboard/lib/payers-queries";
import MoneyValues from "@/shared/components/money-values";
import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@/shared/components/ui/avatar";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/shared/components/ui/tooltip";
import { WidgetEmptyState } from "@/shared/components/widgets/widget-empty-state";
import { getAvatarSrc } from "@/shared/lib/payers/utils";
import { buildInitials } from "@/shared/utils/initials";

type PayersWidgetProps = {
	payers: DashboardPagador[];
};

export function PayersWidget({ payers }: PayersWidgetProps) {
	return (
		<div className="flex flex-col">
			{payers.length === 0 ? (
				<WidgetEmptyState
					icon={<RiGroupLine className="size-6 text-muted-foreground" />}
					title="Nenhuma pessoa para o período"
					description="Quando houver despesas associadas a pessoas, elas aparecerão aqui."
				/>
			) : (
				<div className="flex flex-col">
					{payers.map((payer, index) => {
						const initials = buildInitials(payer.name);
						const hasValidPercentageChange =
							typeof payer.percentageChange === "number" &&
							Number.isFinite(payer.percentageChange);
						const percentageChange = hasValidPercentageChange
							? payer.percentageChange
							: null;

						return (
							<div key={payer.id} className={styles.row}>
								<span className={styles.rank}>{index + 1}</span>
								<div className={styles.main}>
									<Avatar className="size-9.5 shrink-0">
										<AvatarImage
											src={getAvatarSrc(payer.avatarUrl)}
											alt={`Avatar de ${payer.name}`}
										/>
										<AvatarFallback>{initials}</AvatarFallback>
									</Avatar>

									<div className={styles.textStack}>
										<Link
											prefetch
											href={`/payers/${payer.id}`}
											className={styles.titleLink}
										>
											<span className="truncate font-medium">{payer.name}</span>
											{payer.isAdmin && (
												<Tooltip>
													<TooltipTrigger asChild>
														<span className="inline-flex shrink-0">
															<RiVerifiedBadgeFill
																className="size-4 text-blue-500"
																aria-hidden
															/>
															<span className="sr-only">Pessoa principal</span>
														</span>
													</TooltipTrigger>
													<TooltipContent side="top">
														Pessoa principal
													</TooltipContent>
												</Tooltip>
											)}
										</Link>
										<p className={styles.meta}>Despesas no período</p>
									</div>
								</div>

								<div className={styles.trailing}>
									<MoneyValues
										className={styles.trailingValue}
										amount={payer.totalExpenses}
									/>
									<div
										className={`${styles.trailingMeta} text-muted-foreground`}
									>
										<PercentageChangeIndicator value={percentageChange} />
										{percentageChange !== null ? (
											<span>vs. mês ant.</span>
										) : null}
									</div>
								</div>
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}
