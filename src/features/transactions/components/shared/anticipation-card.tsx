"use client";

import { RiCalendarCheckLine } from "@remixicon/react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { ReactNode } from "react";
import type { InstallmentAnticipationListItem } from "@/features/transactions/hooks/use-installment-anticipations";
import MoneyValues from "@/shared/components/money-values";
import { Badge } from "@/shared/components/ui/badge";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/shared/components/ui/card";
import { displayPeriod } from "@/shared/utils/period";

interface AnticipationCardProps {
	anticipation: InstallmentAnticipationListItem;
}

export function AnticipationCard({ anticipation }: AnticipationCardProps) {
	const isSettled = anticipation.transaction?.isSettled === true;
	const totalAmount = Number(anticipation.totalAmount);
	const discount = Number(anticipation.discount);

	const finalAmount =
		totalAmount < 0 ? totalAmount + discount : totalAmount - discount;

	const hasDiscount = discount > 0;

	const formatDate = (date: string) => {
		return format(new Date(date), "dd 'de' MMMM 'de' yyyy", {
			locale: ptBR,
		});
	};

	return (
		<Card className="shadow-none py-2">
			<CardHeader className="space-y-3 p-4 pb-1">
				<div className="flex min-w-0 items-start justify-between gap-3">
					<div className="min-w-0 space-y-1">
						<CardTitle className="text-base leading-none">
							{anticipation.installmentCount}{" "}
							{anticipation.installmentCount === 1
								? "parcela antecipada"
								: "parcelas antecipadas"}
						</CardTitle>

						<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
							<RiCalendarCheckLine className="size-3 shrink-0" />
							<span>{formatDate(anticipation.anticipationDate)}</span>
						</div>
					</div>

					<Badge variant="secondary" className="shrink-0 rounded-full px-3">
						{displayPeriod(anticipation.anticipationPeriod)}
					</Badge>
				</div>

				<div className="flex items-center justify-between gap-3 rounded-lg bg-primary/10 p-3">
					<span className="text-xs font-medium text-foreground">
						{hasDiscount ? "Valor Final" : "Valor Total"}
					</span>

					<span className="text-lg font-semibold leading-none text-primary">
						<MoneyValues amount={finalAmount} />
					</span>
				</div>
			</CardHeader>

			<CardContent className="px-4 pb-4 pt-0">
				<dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
					<DetailItem label="Valor Original">
						<MoneyValues amount={totalAmount} />
					</DetailItem>

					{hasDiscount ? (
						<DetailItem label="Desconto" valueClassName="text-success">
							- <MoneyValues amount={discount} />
						</DetailItem>
					) : (
						<div />
					)}

					<DetailItem label="Status">
						<Badge
							variant={isSettled ? "success" : "outline"}
							className="h-5 rounded-full px-2 text-xs"
						>
							{isSettled ? "Pago" : "Pendente"}
						</Badge>
					</DetailItem>

					{anticipation.payer ? (
						<DetailItem label="Pessoa">{anticipation.payer.name}</DetailItem>
					) : (
						<div />
					)}

					{anticipation.category ? (
						<DetailItem label="Categoria">
							{anticipation.category.name}
						</DetailItem>
					) : null}
				</dl>

				{anticipation.note ? (
					<div className="mt-3 border-t pt-3">
						<p className="text-xs font-medium text-muted-foreground">
							Observação
						</p>
						<p className="mt-1 text-sm leading-snug">{anticipation.note}</p>
					</div>
				) : null}
			</CardContent>
		</Card>
	);
}

function DetailItem({
	label,
	children,
	valueClassName,
}: {
	label: string;
	children: ReactNode;
	valueClassName?: string;
}) {
	return (
		<div className="min-w-0 space-y-1">
			<dt className="text-xs font-medium leading-none text-muted-foreground">
				{label}
			</dt>

			<dd
				className={`truncate text-sm font-medium leading-tight ${
					valueClassName ?? ""
				}`}
			>
				{children}
			</dd>
		</div>
	);
}
