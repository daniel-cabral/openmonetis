import { ACCOUNT_AUTO_INVOICE_NOTE_PREFIX } from "@/shared/lib/accounts/constants";

export const TRANSFER_TRANSACTION_TYPE = "Transferência";

// Transfers and invoice payment/credit lines would double count card purchases (D5).
export function isTripEligible(row: {
	transactionType: string;
	note: string | null | undefined;
}): boolean {
	if (row.transactionType === TRANSFER_TRANSACTION_TYPE) return false;
	return !(row.note ?? "").startsWith(ACCOUNT_AUTO_INVOICE_NOTE_PREFIX);
}
