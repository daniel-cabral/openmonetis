"use client";

import { formatCents } from "@/features/planning/lib/cents";
import { buildBidPreview } from "@/features/planning/lib/consorcio-preview";
import { needsInstallmentMapping } from "@/features/planning/lib/installment-mapping";
import type {
	AmountRange,
	BidPoint,
	Period,
	PriceIndex,
} from "@/features/planning/lib/engine";
import {
	formToPlanInput,
	type PlanFormValues,
} from "@/features/planning/lib/plan-form";
import { CurrencyInput } from "@/shared/components/ui/currency-input";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import { Switch } from "@/shared/components/ui/switch";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/shared/components/ui/table";
import { MonthField, type PatchPlanForm } from "./common-fields";

type BidRow = {
	key: "letter" | "outstanding";
	label: string;
	range: AmountRange;
};

export function ConsorcioFields({
	values,
	patch,
	bidHistory,
	indexForecastPct,
	startMonth,
	categoryIds,
}: {
	values: PlanFormValues;
	patch: PatchPlanForm;
	bidHistory: BidPoint[];
	indexForecastPct: Record<PriceIndex, number>;
	startMonth: Period;
	categoryIds: string[];
}) {
	const planFields = formToPlanInput(values).fields;
	const preview =
		planFields.type === "consorcio"
			? buildBidPreview(
					planFields,
					bidHistory,
					indexForecastPct[values.index],
					startMonth,
					values.targetMonth,
					values.basis,
				)
			: null;
	const bidRows = [
		{ key: "letter", label: "Valor da carta", range: preview?.letter },
		{ key: "outstanding", label: "Saldo devedor", range: preview?.outstanding },
	].filter(
		(row): row is BidRow =>
			row.range != null &&
			(values.bidBase === "both" || values.bidBase === row.key),
	);

	const afterBid = preview?.afterBid ?? null;
	const showMappingWarning = needsInstallmentMapping(planFields, categoryIds);
	const formatAfterBid = ({
		amount,
		months,
	}: {
		amount: number;
		months: number;
	}) =>
		months === 0
			? "Quitado"
			: values.postBidMode === "reduce-term"
				? `${formatCents(amount)} × ${months} meses`
				: formatCents(amount);

	return (
		<div className="space-y-4">
			<div className="grid gap-4 sm:grid-cols-2">
				<div className="space-y-2">
					<Label htmlFor="consorcio-letter">Valor da carta (hoje)</Label>
					<CurrencyInput
						id="consorcio-letter"
						value={values.letterValue}
						onValueChange={(letterValue) => patch({ letterValue })}
						placeholder="R$ 0,00"
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor="consorcio-outstanding">Saldo devedor</Label>
					<CurrencyInput
						id="consorcio-outstanding"
						value={values.outstandingBalance}
						onValueChange={(outstandingBalance) =>
							patch({ outstandingBalance })
						}
						placeholder="R$ 0,00"
					/>
				</div>
			</div>

			<div className="grid gap-4 sm:grid-cols-2">
				<div className="space-y-2">
					<Label htmlFor="consorcio-installment">Parcela mensal (hoje)</Label>
					<CurrencyInput
						id="consorcio-installment"
						value={values.monthlyInstallment}
						onValueChange={(monthlyInstallment) =>
							patch({ monthlyInstallment })
						}
						placeholder="R$ 0,00"
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor="consorcio-last-installment">Última parcela</Label>
					<MonthField
						id="consorcio-last-installment"
						value={values.lastInstallmentMonth}
						onChange={(lastInstallmentMonth) => patch({ lastInstallmentMonth })}
					/>
				</div>
			</div>

			<div className="space-y-2">
				<Label htmlFor="consorcio-post-bid-mode">Após o lance</Label>
				<Select
					value={values.postBidMode}
					onValueChange={(postBidMode) =>
						patch({ postBidMode: postBidMode as PlanFormValues["postBidMode"] })
					}
				>
					<SelectTrigger id="consorcio-post-bid-mode" className="w-full">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="reduce-installment">Reduzir parcela</SelectItem>
						<SelectItem value="reduce-term">Reduzir prazo</SelectItem>
					</SelectContent>
				</Select>
			</div>

			{showMappingWarning ? (
				<p className="text-sm text-warning">
					Mapeie a categoria onde a parcela cai para ela sair do custo de vida.
				</p>
			) : null}

			<div className="space-y-2">
				<Label htmlFor="consorcio-bid-base">Base do lance</Label>
				<Select
					value={values.bidBase}
					onValueChange={(bidBase) =>
						patch({ bidBase: bidBase as PlanFormValues["bidBase"] })
					}
				>
					<SelectTrigger id="consorcio-bid-base" className="w-full">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="letter">Valor da carta</SelectItem>
						<SelectItem value="outstanding">Saldo devedor</SelectItem>
						<SelectItem value="both">
							Ainda não sei (mostrar as duas)
						</SelectItem>
					</SelectContent>
				</Select>
			</div>

			<div className="space-y-2">
				<Label htmlFor="consorcio-margin">
					Margem sobre o lance vencedor (p.p.)
				</Label>
				<Input
					id="consorcio-margin"
					type="number"
					min={0}
					max={50}
					step="0.1"
					value={values.marginPp}
					onChange={(event) => patch({ marginPp: event.target.value })}
				/>
			</div>

			<div className="space-y-3">
				<div className="flex items-center justify-between gap-3">
					<Label htmlFor="consorcio-embedded-bid">Lance embutido</Label>
					<Switch
						id="consorcio-embedded-bid"
						checked={values.embeddedBidEnabled}
						onCheckedChange={(embeddedBidEnabled) =>
							patch({ embeddedBidEnabled })
						}
					/>
				</div>
				{values.embeddedBidEnabled ? (
					<div className="space-y-2">
						<Label htmlFor="consorcio-embedded-bid-pct">% da carta</Label>
						<Input
							id="consorcio-embedded-bid-pct"
							type="number"
							min={0}
							max={30}
							step="0.1"
							value={values.embeddedBidPct}
							onChange={(event) =>
								patch({ embeddedBidPct: event.target.value })
							}
						/>
					</div>
				) : null}
			</div>

			<p className="text-sm text-muted-foreground">Sem FGTS neste plano.</p>

			<div className="space-y-2">
				<Label>Prévia do lance no mês alvo</Label>
				{bidRows.length > 0 ? (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Base</TableHead>
								<TableHead className="text-right">Mínimo</TableHead>
								<TableHead className="text-right">Base</TableHead>
								<TableHead className="text-right">Máximo</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{bidRows.map((row) => (
								<TableRow key={row.key}>
									<TableCell>{row.label}</TableCell>
									<TableCell className="text-right">
										{formatCents(row.range.min)}
									</TableCell>
									<TableCell className="text-right">
										{formatCents(row.range.base)}
									</TableCell>
									<TableCell className="text-right">
										{formatCents(row.range.max)}
									</TableCell>
								</TableRow>
							))}
							{afterBid ? (
								<TableRow>
									<TableCell>Parcela após o lance</TableCell>
									<TableCell className="text-right">
										{formatAfterBid(afterBid.min)}
									</TableCell>
									<TableCell className="text-right">
										{formatAfterBid(afterBid.base)}
									</TableCell>
									<TableCell className="text-right">
										{formatAfterBid(afterBid.max)}
									</TableCell>
								</TableRow>
							) : null}
						</TableBody>
					</Table>
				) : (
					<p className="text-sm text-muted-foreground">
						Sem histórico de lances para estimar.
					</p>
				)}
			</div>
		</div>
	);
}
