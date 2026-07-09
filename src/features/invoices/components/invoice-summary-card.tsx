"use client";

import { RiEditLine, RiEqualizerLine } from "@remixicon/react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
	payInvoicePartialAction,
	updateInvoicePaymentStatusAction,
	updatePaymentDateAction,
} from "@/features/invoices/actions";
import { AccountCardSelectContent } from "@/features/transactions/components/select-items";
import StatusDot from "@/shared/components/feedback/status-dot";
import MoneyValues from "@/shared/components/money-values";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { CurrencyInput } from "@/shared/components/ui/currency-input";
import { DatePicker } from "@/shared/components/ui/date-picker";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/shared/components/ui/dialog";
import { Label } from "@/shared/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import { resolveCardBrandAsset } from "@/shared/lib/cards/brand-assets";
import {
	INVOICE_PAYMENT_STATUS,
	INVOICE_STATUS_BADGE_VARIANT,
	INVOICE_STATUS_DESCRIPTION,
	INVOICE_STATUS_LABEL,
	type InvoicePaymentStatus,
} from "@/shared/lib/invoices";
import { resolveLogoSrc } from "@/shared/lib/logo";
import { formatCurrency } from "@/shared/utils/currency";
import { formatDateOnly } from "@/shared/utils/date";
import { cn } from "@/shared/utils/ui";
import { AdjustInvoiceDialog } from "./adjust-invoice-dialog";
import { EditPaymentDateDialog } from "./edit-payment-date-dialog";

type PaymentAccountOption = {
	value: string;
	label: string;
	logo?: string | null;
};

type InvoiceSummaryCardProps = {
	cardId: string;
	period: string;
	cardName: string;
	cardBrand: string | null;
	cardStatus: string | null;
	closingDay: string;
	dueDay: string;
	periodLabel: string;
	totalAmount: number;
	paidAmount: number;
	outstandingAmount: number;
	limitAmount: number | null;
	invoiceStatus: InvoicePaymentStatus;
	paymentDate: Date | null;
	defaultPaymentAccountId: string | null;
	paymentAccountOptions: PaymentAccountOption[];
	logo?: string | null;
	actions?: React.ReactNode;
};

const actionLabelByStatus: Record<InvoicePaymentStatus, string> = {
	[INVOICE_PAYMENT_STATUS.PENDING]: "Marcar como paga",
	[INVOICE_PAYMENT_STATUS.PAID]: "Desfazer pagamento",
};

const actionVariantByStatus: Record<
	InvoicePaymentStatus,
	"default" | "outline"
> = {
	[INVOICE_PAYMENT_STATUS.PENDING]: "default",
	[INVOICE_PAYMENT_STATUS.PAID]: "outline",
};

const formatDay = (value: string) => value.padStart(2, "0");

const getCardStatusDotColor = (status: string | null) => {
	if (!status) return "bg-gray-400";
	const s = status.toLowerCase();
	return s === "ativo" || s === "active" ? "bg-success" : "bg-gray-400";
};

const formatPaymentDate = (value: Date | null) =>
	formatDateOnly(value, {
		day: "2-digit",
		month: "short",
		year: "numeric",
	}) ?? "data não informada";

export function InvoiceSummaryCard({
	cardId,
	period,
	cardName,
	cardBrand,
	cardStatus,
	closingDay,
	dueDay,
	periodLabel,
	totalAmount,
	paidAmount,
	outstandingAmount,
	limitAmount,
	invoiceStatus,
	paymentDate: initialPaymentDate,
	defaultPaymentAccountId,
	paymentAccountOptions,
	logo,
	actions,
}: InvoiceSummaryCardProps) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [paymentDate, setPaymentDate] = useState<Date>(
		initialPaymentDate ?? new Date(),
	);
	const [paymentAccountId, setPaymentAccountId] = useState<string>(
		defaultPaymentAccountId ?? paymentAccountOptions[0]?.value ?? "",
	);
	const [paymentAmount, setPaymentAmount] = useState<number>(outstandingAmount);
	const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);

	useEffect(() => {
		setPaymentDate(initialPaymentDate ?? new Date());
	}, [initialPaymentDate]);

	useEffect(() => {
		setPaymentAmount(outstandingAmount);
	}, [outstandingAmount]);

	useEffect(() => {
		setPaymentAccountId(
			defaultPaymentAccountId ?? paymentAccountOptions[0]?.value ?? "",
		);
	}, [defaultPaymentAccountId, paymentAccountOptions]);

	const logoPath = resolveLogoSrc(logo);
	const brandAsset = resolveCardBrandAsset(cardBrand);
	const isPaid = invoiceStatus === INVOICE_PAYMENT_STATUS.PAID;
	const paymentDateLabel = isPaid ? formatPaymentDate(paymentDate) : null;
	const actionDescription = isPaid
		? `Pagamento registrado em ${paymentDateLabel}.`
		: INVOICE_STATUS_DESCRIPTION[invoiceStatus];

	const targetStatus = isPaid
		? INVOICE_PAYMENT_STATUS.PENDING
		: INVOICE_PAYMENT_STATUS.PAID;

	const handleAction = (accountId?: string) => {
		startTransition(async () => {
			const result = await updateInvoicePaymentStatusAction({
				cardId,
				period,
				status: targetStatus,
				paymentDate:
					targetStatus === INVOICE_PAYMENT_STATUS.PAID
						? paymentDate.toISOString().split("T")[0]
						: undefined,
				paymentAccountId:
					targetStatus === INVOICE_PAYMENT_STATUS.PAID ? accountId : undefined,
			});

			if (result.success) {
				toast.success(result.message);
				setPaymentDialogOpen(false);
				router.refresh();
				return;
			}

			toast.error(result.error);
		});
	};

	const handlePaymentConfirm = () => {
		if (!paymentAccountId) {
			toast.error("Selecione uma conta para pagar a fatura.");
			return;
		}

		const outstandingCents = Math.round(outstandingAmount * 100);
		const amountCents = Math.round(paymentAmount * 100);

		if (amountCents <= 0 || amountCents > outstandingCents) {
			toast.error("Informe um valor válido para esta fatura.");
			return;
		}

		// Valor menor que o restante → pagamento parcial; caso contrário, quitação.
		if (amountCents < outstandingCents) {
			startTransition(async () => {
				const result = await payInvoicePartialAction({
					cardId,
					period,
					amount: paymentAmount,
					paymentAccountId,
					paymentDate: paymentDate.toISOString().split("T")[0],
				});

				if (result.success) {
					toast.success(result.message);
					setPaymentDialogOpen(false);
					router.refresh();
					return;
				}

				toast.error(result.error);
			});
			return;
		}

		handleAction(paymentAccountId);
	};

	const handleDateChange = (newDate: Date) => {
		setPaymentDate(newDate);
		startTransition(async () => {
			const result = await updatePaymentDateAction({
				cardId,
				period,
				paymentDate: newDate.toISOString().split("T")[0] ?? "",
			});

			if (result.success) {
				toast.success(result.message);
				router.refresh();
				return;
			}

			toast.error(result.error);
		});
	};

	return (
		<Card className="gap-0 py-0 space-y-2">
			<CardContent className="px-4 py-4 sm:px-5 sm:py-5">
				<div className="flex flex-col gap-4">
					{/* Linha 1 — identidade */}
					<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
						<div className="flex min-w-0 items-start gap-3">
							{logoPath ? (
								<div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full">
									<Image
										src={logoPath}
										alt={`Logo ${cardName}`}
										width={48}
										height={48}
										className="h-full w-full object-contain"
									/>
								</div>
							) : cardBrand ? (
								<span className="flex size-12 shrink-0 items-center justify-center rounded-full border bg-card text-sm font-semibold text-primary">
									{cardBrand.slice(0, 2).toUpperCase()}
								</span>
							) : null}
							<div className="min-w-0 space-y-1">
								<h2 className="truncate text-xl font-semibold text-foreground sm:text-2xl">
									{cardName}
								</h2>
								<p className="text-sm leading-relaxed text-muted-foreground">
									Fatura de {periodLabel}
								</p>
							</div>
						</div>
						{actions ? <div className="shrink-0">{actions}</div> : null}
					</div>

					{/* Linha 2 — valor da fatura (hero) */}
					<div className="space-y-3">
						<p className="text-sm text-muted-foreground">Valor da fatura</p>
						{!isPaid && paidAmount > 0 ? (
							<p className="text-xs text-muted-foreground">
								Pago {formatCurrency(paidAmount)} · Restante{" "}
								<span className="font-medium text-foreground">
									{formatCurrency(outstandingAmount)}
								</span>
							</p>
						) : null}
						<div className="flex items-center gap-2">
							<MoneyValues
								amount={Math.abs(totalAmount)}
								className={cn(
									"text-3xl leading-none tracking-tighter sm:text-2xl",
									isPaid ? "text-success" : "text-foreground",
								)}
							/>
							<AdjustInvoiceDialog
								cardId={cardId}
								period={period}
								currentTotal={totalAmount}
								trigger={
									<Button
										type="button"
										variant="ghost"
										size="icon-sm"
										className="text-primary hover:text-primary"
										aria-label="Ajustar fatura"
									>
										<RiEqualizerLine className="size-4" />
									</Button>
								}
							/>
						</div>
						<div className="flex items-center gap-2">
							<Badge
								variant={INVOICE_STATUS_BADGE_VARIANT[invoiceStatus]}
								className="text-xs"
							>
								{INVOICE_STATUS_LABEL[invoiceStatus]}
							</Badge>
							{cardStatus ? (
								<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
									<StatusDot color={getCardStatusDotColor(cardStatus)} />
									<span>{cardStatus}</span>
								</div>
							) : null}
						</div>
					</div>

					{/* Linha 3 — metadados do cartão */}
					<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
						<MetaItem label="Vencimento">
							<span className="text-sm font-medium text-foreground">
								Dia {formatDay(dueDay)}
							</span>
						</MetaItem>

						<MetaItem label="Fechamento">
							<span className="text-sm font-medium text-foreground">
								Dia {formatDay(closingDay)}
							</span>
						</MetaItem>

						{typeof limitAmount === "number" ? (
							<MetaItem label="Limite total">
								<span className="text-sm font-medium text-foreground">
									{formatCurrency(limitAmount)}
								</span>
							</MetaItem>
						) : null}

						{cardBrand ? (
							<MetaItem label="Bandeira">
								<div className="flex items-center gap-1.5">
									{brandAsset ? (
										<Image
											src={brandAsset}
											alt={cardBrand}
											width={24}
											height={24}
											className="h-4 w-auto shrink-0"
										/>
									) : null}
									<span className="text-sm font-medium text-foreground truncate">
										{cardBrand}
									</span>
								</div>
							</MetaItem>
						) : null}
					</div>

					{/* Linha 4 — ação */}
					<div className="flex flex-col gap-3 rounded-md border border-dashed bg-muted/30 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
						<div className="space-y-1">
							<p className="text-xs text-muted-foreground">
								{actionDescription}
							</p>
						</div>
						<div className="flex shrink-0 items-center gap-1.5">
							{isPaid ? (
								<Button
									type="button"
									size="sm"
									variant={actionVariantByStatus[invoiceStatus]}
									disabled={isPending}
									onClick={() => handleAction()}
									className="min-w-32"
								>
									{isPending
										? "Salvando..."
										: actionLabelByStatus[invoiceStatus]}
								</Button>
							) : (
								<PayInvoiceDialog
									open={paymentDialogOpen}
									onOpenChange={setPaymentDialogOpen}
									isPending={isPending}
									paymentDate={paymentDate}
									onPaymentDateChange={setPaymentDate}
									accountId={paymentAccountId}
									onAccountChange={setPaymentAccountId}
									accountOptions={paymentAccountOptions}
									amount={paymentAmount}
									onAmountChange={setPaymentAmount}
									paidAmount={paidAmount}
									outstandingAmount={outstandingAmount}
									onConfirm={handlePaymentConfirm}
									trigger={
										<Button
											type="button"
											size="sm"
											variant={actionVariantByStatus[invoiceStatus]}
											disabled={isPending}
											className="min-w-32"
										>
											{isPending
												? "Salvando..."
												: actionLabelByStatus[invoiceStatus]}
										</Button>
									}
								/>
							)}
							{isPaid ? (
								<EditPaymentDateDialog
									trigger={
										<Button
											type="button"
											variant="ghost"
											size="icon-sm"
											className="text-muted-foreground hover:text-foreground"
											aria-label="Editar data de pagamento"
										>
											<RiEditLine className="size-4" />
										</Button>
									}
									currentDate={paymentDate}
									onDateChange={handleDateChange}
								/>
							) : null}
						</div>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

function MetaItem({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="rounded-md border border-border/60 px-3 py-2">
			<span className="block text-sm font-medium text-muted-foreground">
				{label}
			</span>
			<div className="mt-1">{children}</div>
		</div>
	);
}

type PayInvoiceDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	isPending: boolean;
	paymentDate: Date;
	onPaymentDateChange: (date: Date) => void;
	accountId: string;
	onAccountChange: (accountId: string) => void;
	accountOptions: PaymentAccountOption[];
	amount: number;
	onAmountChange: (amount: number) => void;
	paidAmount: number;
	outstandingAmount: number;
	onConfirm: () => void;
	trigger: ReactNode;
};

function PayInvoiceDialog({
	open,
	onOpenChange,
	isPending,
	paymentDate,
	onPaymentDateChange,
	accountId,
	onAccountChange,
	accountOptions,
	amount,
	onAmountChange,
	paidAmount,
	outstandingAmount,
	onConfirm,
	trigger,
}: PayInvoiceDialogProps) {
	const paymentDateValue = paymentDate.toISOString().split("T")[0] ?? "";
	const selectedAccount = accountOptions.find(
		(option) => option.value === accountId,
	);

	const hasPartialPayments = paidAmount > 0;
	const outstandingCents = Math.round(outstandingAmount * 100);
	const amountCents = Math.round(amount * 100);
	const isAmountValid = amountCents > 0 && amountCents <= outstandingCents;
	const isFullPayment = amountCents >= outstandingCents;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogTrigger asChild>{trigger}</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Confirmar pagamento</DialogTitle>
					<DialogDescription>
						Escolha o valor, a conta de origem e a data do pagamento.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					{hasPartialPayments ? (
						<div className="flex items-center justify-between rounded-md border border-dashed px-3 py-2 text-sm">
							<span className="text-muted-foreground">
								Pago {formatCurrency(paidAmount)}
							</span>
							<span className="font-medium text-foreground">
								Restante {formatCurrency(outstandingAmount)}
							</span>
						</div>
					) : null}

					<div className="space-y-2">
						<div className="flex items-center justify-between">
							<Label htmlFor="invoice-payment-amount">Valor a pagar</Label>
							{amountCents !== outstandingCents ? (
								<Button
									type="button"
									variant="link"
									className="h-auto p-0 text-xs"
									onClick={() => onAmountChange(outstandingAmount)}
									disabled={isPending}
								>
									Pagar tudo
								</Button>
							) : null}
						</div>
						<CurrencyInput
							id="invoice-payment-amount"
							value={amount > 0 ? amount.toFixed(2) : ""}
							onValueChange={(value) =>
								onAmountChange(value ? Number(value) : 0)
							}
							disabled={isPending}
						/>
						{!isAmountValid && amount > 0 ? (
							<p className="text-xs text-destructive">
								Informe um valor entre {formatCurrency(0.01)} e{" "}
								{formatCurrency(outstandingAmount)}.
							</p>
						) : null}
					</div>

					<div className="space-y-2">
						<Label htmlFor="invoice-payment-account">Conta de pagamento</Label>
						<Select
							value={accountId}
							onValueChange={onAccountChange}
							disabled={isPending || accountOptions.length === 0}
						>
							<SelectTrigger id="invoice-payment-account" className="w-full">
								<SelectValue placeholder="Selecione uma conta">
									{selectedAccount ? (
										<AccountCardSelectContent
											label={selectedAccount.label}
											logo={selectedAccount.logo}
										/>
									) : null}
								</SelectValue>
							</SelectTrigger>
							<SelectContent>
								{accountOptions.map((option) => (
									<SelectItem key={option.value} value={option.value}>
										<AccountCardSelectContent
											label={option.label}
											logo={option.logo}
										/>
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<div className="space-y-2">
						<Label htmlFor="invoice-payment-date">Data do pagamento</Label>
						<DatePicker
							id="invoice-payment-date"
							value={paymentDateValue}
							onChange={(value) => {
								if (value) {
									onPaymentDateChange(new Date(`${value}T00:00:00`));
								}
							}}
							disabled={isPending}
						/>
					</div>
				</div>

				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={isPending}
					>
						Cancelar
					</Button>
					<Button
						type="button"
						onClick={onConfirm}
						disabled={
							isPending || accountOptions.length === 0 || !isAmountValid
						}
					>
						{isPending
							? "Confirmando..."
							: isFullPayment
								? `Pagar ${formatCurrency(outstandingAmount)}`
								: `Pagar parcial ${formatCurrency(amount)}`}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
