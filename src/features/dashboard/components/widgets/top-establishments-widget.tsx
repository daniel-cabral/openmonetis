import { RiStore2Line } from "@remixicon/react";
import { dashboardWidgetListStyles as styles } from "@/features/dashboard/components/dashboard-widget-list-styles";
import type { TopEstablishmentsData } from "@/features/dashboard/lib/top-establishments-queries";
import { EstablishmentLogo } from "@/shared/components/entity-avatar";
import MoneyValues from "@/shared/components/money-values";
import { WidgetEmptyState } from "@/shared/components/widgets/widget-empty-state";

type TopEstablishmentsWidgetProps = {
	data: TopEstablishmentsData;
};

const formatOccurrencesLabel = (occurrences: number) => {
	if (occurrences === 1) {
		return "1 lançamento";
	}
	return `${occurrences} lançamentos`;
};

export function TopEstablishmentsWidget({
	data,
}: TopEstablishmentsWidgetProps) {
	return (
		<div className="flex flex-col px-0">
			{data.establishments.length === 0 ? (
				<WidgetEmptyState
					icon={<RiStore2Line className="size-6 text-muted-foreground" />}
					title="Nenhum estabelecimento encontrado"
					description="Quando houver despesas registradas, elas aparecerão aqui."
				/>
			) : (
				<div className="flex flex-col">
					{data.establishments.map((establishment, index) => {
						return (
							<div key={establishment.id} className={styles.row}>
								<span className={styles.rank}>{index + 1}</span>
								<div className={styles.main}>
									<EstablishmentLogo name={establishment.name} size={37} />

									<div className={styles.textStack}>
										<p className={styles.title}>{establishment.name}</p>
										<p className={styles.meta}>
											{formatOccurrencesLabel(establishment.occurrences)} ·
											total acumulado
										</p>
									</div>
								</div>

								<div className={styles.trailing}>
									<MoneyValues
										className={styles.trailingValue}
										amount={establishment.amount}
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
