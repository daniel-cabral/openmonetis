import { connection } from "next/server";
import { EstablishmentsList } from "@/features/reports/components/establishments/establishments-list";
import { HighlightsCards } from "@/features/reports/components/establishments/highlights-cards";
import { PeriodFilterButtons } from "@/features/reports/components/establishments/period-filter";
import { SummaryCards } from "@/features/reports/components/establishments/summary-cards";
import { TopCategories } from "@/features/reports/components/establishments/top-categories";
import { EstablishmentsTripFilter } from "@/features/reports/components/establishments/trip-filter";
import {
	fetchTopEstablishmentsData,
	type PeriodFilter,
} from "@/features/reports/establishments/queries";
import { ContentErrorBoundary } from "@/shared/components/feedback/content-error-boundary";
import { Card } from "@/shared/components/ui/card";
import { getUser } from "@/shared/lib/auth/server";
import { fetchUserTrips } from "@/shared/lib/trips/queries";
import {
	parseTripFilterParam,
	TRIP_FILTER_PARAM,
	tripFilterToParam,
} from "@/shared/lib/trips/trip-filter-param";
import { parsePeriodParam } from "@/shared/utils/period";

type PageSearchParams = Promise<Record<string, string | string[] | undefined>>;

type PageProps = {
	searchParams?: PageSearchParams;
};

const getSingleParam = (
	params: Record<string, string | string[] | undefined> | undefined,
	key: string,
) => {
	const value = params?.[key];
	if (!value) return null;
	return Array.isArray(value) ? (value[0] ?? null) : value;
};

const validatePeriodFilter = (value: string | null): PeriodFilter => {
	if (value === "3" || value === "6" || value === "12") {
		return value;
	}
	return "6";
};

export default function EstablishmentsPage({ searchParams }: PageProps) {
	return (
		<ContentErrorBoundary
			title="Não foi possível carregar os estabelecimentos"
			description="Os dados deste relatório não puderam ser carregados agora."
		>
			<EstablishmentsContent searchParams={searchParams} />
		</ContentErrorBoundary>
	);
}

async function EstablishmentsContent({ searchParams }: PageProps) {
	await connection();
	const user = await getUser();
	const resolvedSearchParams = searchParams ? await searchParams : undefined;
	const periodoParam = getSingleParam(resolvedSearchParams, "periodo");
	const mesesParam = getSingleParam(resolvedSearchParams, "meses");

	const { period: currentPeriod } = parsePeriodParam(periodoParam);
	const periodFilter = validatePeriodFilter(mesesParam);

	const trips = await fetchUserTrips(user.id);
	const tripFilter = parseTripFilterParam(
		getSingleParam(resolvedSearchParams, TRIP_FILTER_PARAM),
		trips,
	);

	const data = await fetchTopEstablishmentsData(
		user.id,
		currentPeriod,
		periodFilter,
		tripFilter,
	);

	return (
		<main className="flex flex-col gap-4">
			<Card className="flex-col gap-2 p-3 md:flex-row md:items-center md:justify-between">
				<span className="text-sm text-muted-foreground">
					{tripFilter.kind === "trip"
						? data.periodLabel
						: "Selecione o intervalo de meses"}
				</span>
				<div className="flex flex-col gap-2 md:flex-row md:items-center">
					<EstablishmentsTripFilter
						trips={trips}
						value={tripFilterToParam(tripFilter)}
					/>
					{tripFilter.kind === "trip" ? null : (
						<PeriodFilterButtons currentFilter={periodFilter} />
					)}
				</div>
			</Card>

			<SummaryCards summary={data.summary} />

			<HighlightsCards summary={data.summary} />

			<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
				<div>
					<EstablishmentsList establishments={data.establishments} />
				</div>
				<div>
					<TopCategories categories={data.topCategories} />
				</div>
			</div>
		</main>
	);
}
