"use client";

import { useEffect, useRef, useState } from "react";
import {
	getCurrentDateString,
	type InvoiceDialogState,
	isInvoicePaid,
	markInvoiceAsPaid,
} from "@/features/dashboard/invoices/invoices-helpers";
import type { DashboardInvoice } from "@/features/dashboard/invoices/invoices-queries";
import {
	type PaymentDialogController,
	usePaymentDialogController,
} from "@/features/dashboard/payments/use-payment-dialog-controller";
import {
	payInvoicePartialAction,
	updateInvoicePaymentStatusAction,
} from "@/features/invoices/actions";
import { INVOICE_PAYMENT_STATUS } from "@/shared/lib/invoices";

const toCents = (value: number) => Math.round(value * 100);

type InvoicesWidgetController = Omit<
	PaymentDialogController<DashboardInvoice>,
	"selectedItem"
> & {
	selectedInvoice: DashboardInvoice | null;
	modalState: InvoiceDialogState;
	paymentAccountId: string;
	setPaymentAccountId: (accountId: string) => void;
	paymentDate: Date;
	setPaymentDate: (date: Date) => void;
	paymentAmount: number;
	setPaymentAmount: (amount: number) => void;
	/** Verdadeiro quando o último pagamento confirmado foi parcial (não quitou). */
	lastPaymentWasPartial: boolean;
};

export function useInvoicesWidgetController(
	invoices: DashboardInvoice[],
): InvoicesWidgetController {
	const [paymentAccountId, setPaymentAccountId] = useState<string>("");
	const [paymentDate, setPaymentDate] = useState<Date>(() => new Date());
	const [paymentAmount, setPaymentAmount] = useState<number>(0);
	const [lastPaymentWasPartial, setLastPaymentWasPartial] = useState(false);

	const paymentAccountIdRef = useRef(paymentAccountId);
	const paymentDateRef = useRef(paymentDate);
	const paymentAmountRef = useRef(paymentAmount);
	const wasPartialRef = useRef(false);
	paymentAccountIdRef.current = paymentAccountId;
	paymentDateRef.current = paymentDate;
	paymentAmountRef.current = paymentAmount;

	const controller = usePaymentDialogController({
		items: invoices,
		getItemId: (invoice) => invoice.id,
		isItemConfirmed: (invoice) => isInvoicePaid(invoice.paymentStatus),
		executeConfirm: (invoice) => {
			const accountId = paymentAccountIdRef.current || undefined;
			const date = paymentDateRef.current;
			const isoDate = date.toISOString().split("T")[0];
			const amount = paymentAmountRef.current;

			const outstandingCents = toCents(invoice.outstandingAmount);
			const amountCents = toCents(amount);
			const isPartial = amountCents > 0 && amountCents < outstandingCents;
			wasPartialRef.current = isPartial;
			setLastPaymentWasPartial(isPartial);

			if (isPartial) {
				return payInvoicePartialAction({
					cardId: invoice.cardId,
					period: invoice.period,
					amount,
					paymentAccountId: accountId,
					paymentDate: isoDate,
				});
			}

			return updateInvoicePaymentStatusAction({
				cardId: invoice.cardId,
				period: invoice.period,
				status: INVOICE_PAYMENT_STATUS.PAID,
				paymentAccountId: accountId,
				paymentDate: isoDate,
			});
		},
		applyConfirmedState: (invoice) => {
			if (wasPartialRef.current) {
				const amount = paymentAmountRef.current;
				return {
					...invoice,
					paidAmount: invoice.paidAmount + amount,
					outstandingAmount: Math.max(0, invoice.outstandingAmount - amount),
				};
			}
			return markInvoiceAsPaid(invoice, getCurrentDateString());
		},
	});

	const selectedInvoiceId = controller.selectedItem?.id ?? null;
	const selectedDefaultAccountId =
		controller.selectedItem?.defaultPaymentAccountId ?? "";
	const selectedOutstanding = controller.selectedItem?.outstandingAmount ?? 0;

	useEffect(() => {
		if (!selectedInvoiceId) {
			return;
		}
		setPaymentAccountId(selectedDefaultAccountId);
		setPaymentDate(new Date());
		setPaymentAmount(selectedOutstanding);
	}, [selectedInvoiceId, selectedDefaultAccountId, selectedOutstanding]);

	return {
		...controller,
		selectedInvoice: controller.selectedItem,
		paymentAccountId,
		setPaymentAccountId,
		paymentDate,
		setPaymentDate,
		paymentAmount,
		setPaymentAmount,
		lastPaymentWasPartial,
	};
}
