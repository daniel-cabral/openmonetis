"use client";

import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { RiSliceFill } from "@remixicon/react";
import { useState } from "react";
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
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@/shared/components/ui/toggle-group";
import {
	formatCurrency,
	formatDecimalForDbRequired,
	normalizeDecimalInput,
} from "@/shared/utils/currency";
import { safeToNumber } from "@/shared/utils/number";
import { cn } from "@/shared/utils/ui";
import { PayerSelectContent } from "../../select-items";
import type { PayerSectionProps } from "./transaction-dialog-types";

type SplitInputMode = "currency" | "percentage";

const SPLIT_MODE_OPTIONS = [
	{ value: "currency", label: "R$" },
	{ value: "percentage", label: "%" },
] as const satisfies ReadonlyArray<{ value: SplitInputMode; label: string }>;

const amountToPercent = (amount: string, total: number): string => {
	if (total <= 0) return "";
	const numeric = safeToNumber(normalizeDecimalInput(amount), Number.NaN);
	if (!Number.isFinite(numeric)) return "";
	const pct = (numeric / total) * 100;
	return (Math.round(pct * 10) / 10).toString();
};

const percentToAmount = (percent: string, total: number): string => {
	const pct = safeToNumber(normalizeDecimalInput(percent), Number.NaN);
	if (!Number.isFinite(pct) || total <= 0) return "0.00";
	const clamped = Math.min(100, Math.max(0, pct));
	return formatDecimalForDbRequired((total * clamped) / 100);
};

function SplitModeToggle({
	mode,
	onModeChange,
}: {
	mode: SplitInputMode;
	onModeChange: (mode: SplitInputMode) => void;
}) {
	return (
		<ToggleGroup
			type="single"
			size="sm"
			variant="outline"
			value={mode}
			onValueChange={(value) => {
				if (value) onModeChange(value as SplitInputMode);
			}}
			aria-label="Modo de entrada do split"
			className="h-7 text-xs"
		>
			{SPLIT_MODE_OPTIONS.map((option) => (
				<ToggleGroupItem
					key={option.value}
					value={option.value}
					className="px-2 py-0 h-7 text-xs"
				>
					{option.label}
				</ToggleGroupItem>
			))}
		</ToggleGroup>
	);
}

function SplitAmountField({
	mode,
	value,
	totalAmount,
	onAmountChange,
	ariaLabel,
}: {
	mode: SplitInputMode;
	value: string;
	totalAmount: number;
	onAmountChange: (amount: string) => void;
	ariaLabel: string;
}) {
	if (mode === "currency") {
		return (
			<CurrencyInput
				value={value}
				onValueChange={onAmountChange}
				placeholder="R$ 0,00"
				className="h-9 w-[45%] text-sm"
			/>
		);
	}

	return (
		<div className="w-[45%] space-y-1">
			<div className="relative">
				<Input
					type="text"
					inputMode="decimal"
					value={amountToPercent(value, totalAmount)}
					onChange={(event) => {
						const sanitized = event.target.value.replace(/[^\d.,]/g, "");
						onAmountChange(percentToAmount(sanitized, totalAmount));
					}}
					placeholder="0"
					aria-label={ariaLabel}
					className="h-9 w-full pr-7 text-sm"
				/>
				<span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs text-muted-foreground">
					%
				</span>
			</div>
			<p className="ml-1 text-xs text-muted-foreground">
				{formatCurrency(safeToNumber(value))}
			</p>
		</div>
	);
}

export function PayerSection({
	formState,
	onFieldChange,
	payerOptions,
	secondaryPayerOptions,
	totalAmount,
}: PayerSectionProps) {
	const [splitMode, setSplitMode] = useState<SplitInputMode>("currency");

	const handlePrimaryAmountChange = (value: string) => {
		onFieldChange("primarySplitAmount", value);
		const remaining = Math.max(0, totalAmount - safeToNumber(value));
		onFieldChange("secondarySplitAmount", remaining.toFixed(2));
	};

	const handleSecondaryAmountChange = (value: string) => {
		onFieldChange("secondarySplitAmount", value);
		const remaining = Math.max(0, totalAmount - safeToNumber(value));
		onFieldChange("primarySplitAmount", remaining.toFixed(2));
	};

	return (
		<div className="space-y-3">
			<div
				className={cn(
					"flex items-center justify-between rounded-lg border px-3 py-2.5 transition-colors",
					formState.isSplit
						? "border-primary/20 bg-primary/5"
						: "border-border bg-transparent",
				)}
			>
				<div className="flex items-center gap-2">
					<div>
						<p className="text-sm text-foreground">Dividir lançamento</p>
						<p className="text-xs text-muted-foreground">
							Atribuir parte do valor a outra pessoa.
						</p>
					</div>
				</div>
				<div className="flex items-center gap-2">
					{formState.isSplit ? (
						<SplitModeToggle mode={splitMode} onModeChange={setSplitMode} />
					) : null}
					<CheckboxPrimitive.Root
						checked={formState.isSplit}
						onCheckedChange={(checked) =>
							onFieldChange("isSplit", Boolean(checked))
						}
						aria-label="Dividir lançamento"
						className={cn(
							"peer size-4 shrink-0 rounded-lg border shadow-xs transition-shadow outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
							formState.isSplit
								? "border-primary bg-primary text-primary-foreground"
								: "border-input dark:bg-input/30",
						)}
					>
						<CheckboxPrimitive.Indicator className="grid place-content-center text-current transition-none">
							<RiSliceFill className="size-3" />
						</CheckboxPrimitive.Indicator>
					</CheckboxPrimitive.Root>
				</div>
			</div>

			<div className="flex w-full flex-col gap-2 md:flex-row">
				<div className="w-full space-y-1">
					<Label htmlFor="payer">Pessoa</Label>
					<div className="flex gap-2">
						<Select
							value={formState.payerId ?? ""}
							onValueChange={(value) => onFieldChange("payerId", value)}
						>
							<SelectTrigger
								id="payer"
								className={formState.isSplit ? "min-w-0 flex-1" : "w-full"}
							>
								<SelectValue placeholder="Selecione">
									{formState.payerId &&
										(() => {
											const selectedOption = payerOptions.find(
												(opt) => opt.value === formState.payerId,
											);
											return selectedOption ? (
												<PayerSelectContent
													label={selectedOption.label}
													avatarUrl={selectedOption.avatarUrl}
												/>
											) : null;
										})()}
								</SelectValue>
							</SelectTrigger>
							<SelectContent>
								{payerOptions.map((option) => (
									<SelectItem key={option.value} value={option.value}>
										<PayerSelectContent
											label={option.label}
											avatarUrl={option.avatarUrl}
										/>
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						{formState.isSplit ? (
							<SplitAmountField
								mode={splitMode}
								value={formState.primarySplitAmount}
								totalAmount={totalAmount}
								onAmountChange={handlePrimaryAmountChange}
								ariaLabel="Porcentagem da pessoa"
							/>
						) : null}
					</div>
				</div>

				{formState.isSplit ? (
					<div className="w-full space-y-1 mb-1">
						<Label htmlFor="secondaryPayer">Dividir com</Label>
						<div className="flex gap-2">
							<Select
								value={formState.secondaryPayerId ?? ""}
								onValueChange={(value) =>
									onFieldChange("secondaryPayerId", value)
								}
							>
								<SelectTrigger
									id="secondaryPayer"
									disabled={secondaryPayerOptions.length === 0}
									className="w-[55%]"
								>
									<SelectValue placeholder="Selecione">
										{formState.secondaryPayerId &&
											(() => {
												const selectedOption = secondaryPayerOptions.find(
													(opt) => opt.value === formState.secondaryPayerId,
												);
												return selectedOption ? (
													<PayerSelectContent
														label={selectedOption.label}
														avatarUrl={selectedOption.avatarUrl}
													/>
												) : null;
											})()}
									</SelectValue>
								</SelectTrigger>
								<SelectContent>
									{secondaryPayerOptions.map((option) => (
										<SelectItem key={option.value} value={option.value}>
											<PayerSelectContent
												label={option.label}
												avatarUrl={option.avatarUrl}
											/>
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<SplitAmountField
								mode={splitMode}
								value={formState.secondarySplitAmount}
								totalAmount={totalAmount}
								onAmountChange={handleSecondaryAmountChange}
								ariaLabel="Porcentagem do segundo pagador"
							/>
						</div>
					</div>
				) : null}
			</div>
		</div>
	);
}
