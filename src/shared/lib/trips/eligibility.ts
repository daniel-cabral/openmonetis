import { and, isNull, ne, notLike, or, type SQL } from "drizzle-orm";
import { transactions } from "@/db/schema";
import { ACCOUNT_AUTO_INVOICE_NOTE_PREFIX } from "@/shared/lib/accounts/constants";
import { TRANSFER_TRANSACTION_TYPE } from "./is-trip-eligible";

export { isTripEligible } from "./is-trip-eligible";

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
