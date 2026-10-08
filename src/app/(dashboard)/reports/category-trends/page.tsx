import { redirect } from "next/navigation";
import { connection } from "next/server";
import type { Category } from "@/db/schema";
import { CategoryReportPage } from "@/features/reports/components/category-report-page";
import type {
	CategoryOption,
	FilterState,
} from "@/features/reports/components/types";
import { fetchCategoryChartData } from "@/features/reports/lib/category-chart-queries";
import { fetchCategoryReport } from "@/features/reports/lib/category-report-queries";
import { fetchUserCategories } from "@/features/reports/lib/category-trends-queries";
import { validateDateRange } from "@/features/reports/lib/utils";
import { ContentErrorBoundary } from "@/shared/components/feedback/content-error-boundary";
import { getUserId } from "@/shared/lib/auth/server";
import { fetchTripPeriodRanges } from "@/shared/lib/trips/period-ranges";
import { fetchUserTrips } from "@/shared/lib/trips/queries";
import {
	parseTripFilterParam,
	TRIP_FILTER_PARAM,
	tripFilterToParam,
} from "@/shared/lib/trips/trip-filter-param";
import type { CategoryReportFilters } from "@/shared/lib/types/reports";
import { addMonthsToPeriod, getCurrentPeriod } from "@/shared/utils/period";

type PageSearchParams = Promise<Record<string, string | string[] | undefined>>;

type PageProps = {
	searchParams?: PageSearchParams;
};

const getSingleParam = (
	params: Record<string, string | string[] | undefined> | undefined,
	key: string,
): string | null => {
	const value = params?.[key];
	if (!value) return null;
	return Array.isArray(value) ? (value[0] ?? null) : value;
};

export default function Page({ searchParams }: PageProps) {
	return (
		<ContentErrorBoundary
			title="Não foi possível carregar as tendências"
			description="A evolução das categorias não pôde ser carregada agora."
		>
			<CategoryTrendsContent searchParams={searchParams} />
		</ContentErrorBoundary>
	);
}

async function CategoryTrendsContent({ searchParams }: PageProps) {
	await connection();
	// Get authenticated user
	const userId = await getUserId();

	// Resolve search params
	const resolvedSearchParams = searchParams ? await searchParams : undefined;

	// Extract query params
	const inicioParam = getSingleParam(resolvedSearchParams, "inicio");
	const fimParam = getSingleParam(resolvedSearchParams, "fim");
	const categoriasParam =
		getSingleParam(resolvedSearchParams, "categorias") ??
		getSingleParam(resolvedSearchParams, "categories");
	const tripParamRaw = getSingleParam(resolvedSearchParams, TRIP_FILTER_PARAM);

	// Calculate default period (last 6 months)
	const currentPeriod = getCurrentPeriod();
	const defaultStartPeriod = addMonthsToPeriod(currentPeriod, -5); // 6 months including current

	// Use params or defaults
	const startPeriod = inicioParam ?? defaultStartPeriod;
	const endPeriod = fimParam ?? currentPeriod;

	// Parse selected categories
	const selectedCategoryIds = categoriasParam
		? categoriasParam.split(",").filter(Boolean)
		: [];

	// Validate date range
	const validation = validateDateRange(startPeriod, endPeriod);
	if (!validation.isValid) {
		// Redirect to default if validation fails
		redirect(
			`/reports/category-trends?inicio=${defaultStartPeriod}&fim=${currentPeriod}`,
		);
	}

	// Fetch all categories for the user
	const [categoryRows, trips, tripRanges] = await Promise.all([
		fetchUserCategories(userId),
		fetchUserTrips(userId),
		fetchTripPeriodRanges(userId),
	]);
	const tripFilter = parseTripFilterParam(tripParamRaw, trips);

	// Map to CategoryOption format
	const categoryOptions: CategoryOption[] = categoryRows.map(
		(cat: Category): CategoryOption => ({
			id: cat.id,
			name: cat.name,
			icon: cat.icon,
			type: cat.type as "despesa" | "receita",
		}),
	);

	// Build filters for data fetching
	const filters: CategoryReportFilters = {
		startPeriod,
		endPeriod,
		categoryIds:
			selectedCategoryIds.length > 0 ? selectedCategoryIds : undefined,
		tripFilter,
	};

	// Fetch report data
	const reportData = await fetchCategoryReport(userId, filters);

	// Fetch chart data with same filters
	const chartData = await fetchCategoryChartData(
		userId,
		startPeriod,
		endPeriod,
		selectedCategoryIds.length > 0 ? selectedCategoryIds : undefined,
		tripFilter,
	);

	// Build initial filter state for client component
	const initialFilters: FilterState = {
		selectedCategories: selectedCategoryIds,
		startPeriod,
		endPeriod,
	};

	return (
		<main className="flex flex-col gap-6">
			<CategoryReportPage
				initialData={reportData}
				categories={categoryOptions}
				initialFilters={initialFilters}
				chartData={chartData}
				trips={trips}
				tripRanges={tripRanges}
				tripParam={tripFilterToParam(tripFilter)}
			/>
		</main>
	);
}
