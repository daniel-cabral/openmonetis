import { notFound } from "next/navigation";
import { connection } from "next/server";
import { CategoryDetailHeader } from "@/features/categories/components/category-detail-header";
import {
	buildSubcategoryBreakdown,
	filterTransactionsBySubcategory,
	NO_SUBCATEGORY_FILTER,
	SUBCATEGORY_FILTER_PARAM,
} from "@/features/categories/lib/subcategory-breakdown";
import { fetchSubcategoriesForCategory } from "@/features/categories/queries";
import { fetchCategoryDetails } from "@/features/dashboard/categories/category-details-queries";
import { fetchUserPreferences } from "@/features/settings/queries";
import { TransactionsPage } from "@/features/transactions/components/page/transactions-page";
import {
	buildOptionSets,
	buildSluggedFilters,
} from "@/features/transactions/lib/page-helpers";
import {
	fetchRecentEstablishments,
	fetchTransactionFilterSources,
} from "@/features/transactions/queries";
import MonthNavigation from "@/shared/components/month-picker/month-navigation";
import { getUserId } from "@/shared/lib/auth/server";
import { displayPeriod, parsePeriodParam } from "@/shared/utils/period";

type PageSearchParams = Promise<Record<string, string | string[] | undefined>>;

type PageProps = {
	params: Promise<{ categoryId: string }>;
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

export default async function Page({ params, searchParams }: PageProps) {
	await connection();
	const { categoryId } = await params;
	const userId = await getUserId();
	const resolvedSearchParams = searchParams ? await searchParams : undefined;

	const periodoParam = getSingleParam(resolvedSearchParams, "periodo");
	const { period: selectedPeriod } = parsePeriodParam(periodoParam);

	const [filterSources, estabelecimentos, userPreferences, subcategories] =
		await Promise.all([
			fetchTransactionFilterSources(userId),
			fetchRecentEstablishments(userId),
			fetchUserPreferences(userId),
			fetchSubcategoriesForCategory(userId, categoryId),
		]);
	const detail = await fetchCategoryDetails(
		userId,
		categoryId,
		selectedPeriod,
		userPreferences?.hideAnticipatedInstallments ?? false,
	);

	if (!detail) {
		notFound();
	}

	const subcategoryFilter = getSingleParam(
		resolvedSearchParams,
		SUBCATEGORY_FILTER_PARAM,
	);
	const buildCategoryHref = (subcategoryValue: string | null) => {
		const params = new URLSearchParams();
		for (const [key, value] of Object.entries(resolvedSearchParams ?? {})) {
			if (key === SUBCATEGORY_FILTER_PARAM || !value) continue;
			for (const item of Array.isArray(value) ? value : [value]) {
				params.append(key, item);
			}
		}
		if (subcategoryValue) {
			params.set(SUBCATEGORY_FILTER_PARAM, subcategoryValue);
		}
		const query = params.toString();
		return query
			? `/categories/${categoryId}?${query}`
			: `/categories/${categoryId}`;
	};
	const subcategoryRows = buildSubcategoryBreakdown(
		detail.transactions,
		subcategories,
	).map((row) => {
		const active =
			row.subcategoryId === null
				? subcategoryFilter === NO_SUBCATEGORY_FILTER
				: subcategoryFilter === row.subcategoryId;
		return {
			...row,
			active,
			href: buildCategoryHref(
				active ? null : (row.subcategoryId ?? NO_SUBCATEGORY_FILTER),
			),
		};
	});

	const sluggedFilters = buildSluggedFilters(filterSources);
	const {
		payerOptions,
		splitPayerOptions,
		defaultPayerId,
		accountOptions,
		cardOptions,
		categoryOptions,
		payerFilterOptions,
		categoryFilterOptions,
		accountCardFilterOptions,
	} = buildOptionSets({
		...sluggedFilters,
		payerRows: filterSources.payerRows,
	});

	const currentPeriodLabel = displayPeriod(detail.period);
	const previousPeriodLabel = displayPeriod(detail.previousPeriod);

	return (
		<main className="flex flex-col gap-6">
			<MonthNavigation />
			<CategoryDetailHeader
				category={detail.category}
				currentPeriodLabel={currentPeriodLabel}
				previousPeriodLabel={previousPeriodLabel}
				currentTotal={detail.currentTotal}
				previousTotal={detail.previousTotal}
				percentageChange={detail.percentageChange}
				transactionCount={detail.transactions.length}
				subcategoryRows={subcategoryRows}
			/>
			<TransactionsPage
				currentUserId={userId}
				transactions={filterTransactionsBySubcategory(
					detail.transactions,
					subcategoryFilter,
					subcategories,
				)}
				payerOptions={payerOptions}
				splitPayerOptions={splitPayerOptions}
				defaultPayerId={defaultPayerId}
				accountOptions={accountOptions}
				cardOptions={cardOptions}
				categoryOptions={categoryOptions}
				payerFilterOptions={payerFilterOptions}
				categoryFilterOptions={categoryFilterOptions}
				accountCardFilterOptions={accountCardFilterOptions}
				selectedPeriod={detail.period}
				estabelecimentos={estabelecimentos}
				allowCreate={true}
				noteAsColumn={userPreferences?.statementNoteAsColumn ?? false}
				columnOrder={userPreferences?.transactionsColumnOrder ?? null}
				groupTransactionsByDate={
					userPreferences?.groupTransactionsByDate ?? true
				}
				attachmentMaxSizeMb={userPreferences?.attachmentMaxSizeMb ?? 50}
			/>
		</main>
	);
}
