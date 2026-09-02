import { connection } from "next/server";
import { ReconciliationPage } from "@/features/transactions/components/reconciliation/reconciliation-page";
import { buildOptionSets, buildSluggedFilters } from "@/features/transactions/lib/page-helpers";
import { fetchTransactionFilterSources } from "@/features/transactions/queries";
import { getUserId } from "@/shared/lib/auth/server";

export default async function Page() {
	await connection();
	const userId = await getUserId();
	const filterSources = await fetchTransactionFilterSources(userId);
	const sluggedFilters = buildSluggedFilters(filterSources);
	const { accountOptions, cardOptions } = buildOptionSets({
		...sluggedFilters,
		payerRows: filterSources.payerRows,
	});

	return (
		<main className="flex flex-col gap-6">
			<ReconciliationPage
				accountOptions={accountOptions}
				cardOptions={cardOptions}
			/>
		</main>
	);
}
