import { and, isNull, ne, notLike, or, type SQL } from "drizzle-orm";
import { transactions } from "@/db/schema";
import { ACCOUNT_AUTO_INVOICE_NOTE_PREFIX } from "@/shared/lib/accounts/constants";

const TRANSFER_TRANSACTION_TYPE = "Transferência";

// Transfers and invoice payment/credit lines would double count card purchases (D5).
export function isTripEligible(row: {
	transactionType: string;
	note: string | null | undefined;
}): boolean {
	if (row.transactionType === TRANSFER_TRANSACTION_TYPE) return false;
	return !(row.note ?? "").startsWith(ACCOUNT_AUTO_INVOICE_NOTE_PREFIX);
}

export function tripEligibleCondition(): SQL {
	return and(
		isNull(transactions.transferId),
		ne(transactions.transactionType, TRANSFER_TRANSACTION_TYPE),
		or(
			isNull(transactions.note),
			notLike(transactions.note, `${ACCOUNT_AUTO_INVOICE_NOTE_PREFIX}%`),
		),
	) as SQL;
}
