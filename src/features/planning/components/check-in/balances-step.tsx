"use client";

import { RiAddLine, RiDeleteBinLine } from "@remixicon/react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import {
	replaceAccountPositionsAction,
	setAccountEarmarkedAction,
} from "@/features/planning/actions";
import { centsToDecimal, toCents } from "@/features/planning/lib/cents";
import type { PositionLineDraft } from "@/features/planning/lib/check-in";
import type { LiquidityKind } from "@/features/planning/lib/engine";
import { LIQUIDITY_LABEL } from "@/features/planning/lib/labels";
import type { InvestmentAccountView } from "@/features/planning/lib/snapshot-types";
import { ageInDays } from "@/features/planning/lib/view-model";
import { Button } from "@/shared/components/ui/button";
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

const EMPTY_LINE: PositionLineDraft = {
	description: "",
	amount: 0,
	liquidity: "daily",
	maturityMonth: null,
	annualRealReturnPct: null,
};

export function BalancesStep({
	accounts,
	today,
	drafts,
	onDraftsChange,
}: {
	accounts: InvestmentAccountView[];
	today: string;
	drafts: Record<string, PositionLineDraft[]>;
	onDraftsChange: (next: Record<string, PositionLineDraft[]>) => void;
}) {
	if (accounts.length === 0) {
		return (
			<p className="text-sm text-muted-foreground">
				Cadastre uma conta de investimento para registrar saldos.
			</p>
		);
	}

	return (
		<div className="space-y-6">
			{accounts.map((account) => (
				<AccountBalance
					key={account.id}
					account={account}
					today={today}
					lines={drafts[account.id] ?? []}
					onLinesChange={(lines) =>
						onDraftsChange({ ...drafts, [account.id]: lines })
					}
				/>
			))}
		</div>
	);
}

function AccountBalance({
	account,
	today,
	lines,
	onLinesChange,
}: {
	account: InvestmentAccountView;
	today: string;
	lines: PositionLineDraft[];
	onLinesChange: (lines: PositionLineDraft[]) => void;
}) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const age = account.lastAsOf
		? ageInDays(account.lastAsOf, new Date(`${today}T00:00:00`))
		: null;

	const updateLine = (index: number, patch: Partial<PositionLineDraft>) =>
		onLinesChange(
			lines.map((line, i) => (i === index ? { ...line, ...patch } : line)),
		);

	const toggleEarmarked = (earmarked: boolean) => {
		startTransition(async () => {
			const result = await setAccountEarmarkedAction({
				accountId: account.id,
				earmarked,
			});

			if (result.success) {
				toast.success(result.message);
				router.refresh();
				return;
			}

			toast.error(result.error);
		});
	};

	const saveAccount = () => {
		startTransition(async () => {
			const result = await replaceAccountPositionsAction({
				accountId: account.id,
				asOf: today,
				positions: lines,
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
		<section className="space-y-3 rounded-lg border p-4">
			<header className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<p className="font-medium">{account.name}</p>
					<p className="text-xs text-muted-foreground">
						{age === null
							? "Sem saldo registrado"
							: `atualizado há ${age} dias`}
					</p>
				</div>
				<div className="flex items-center gap-2">
					<Label htmlFor={`earmark-${account.id}`}>Pote reservado</Label>
					<Switch
						id={`earmark-${account.id}`}
						checked={account.isEarmarkedPot}
						disabled={isPending}
						onCheckedChange={toggleEarmarked}
					/>
				</div>
			</header>

			{lines.map((line, index) => (
				<div
					key={index}
					className="grid items-end gap-2 sm:grid-cols-[1fr_8rem_9rem_8rem_6rem_auto]"
				>
					<Input
						aria-label="Descrição da posição"
						value={line.description}
						onChange={(event) =>
							updateLine(index, { description: event.target.value })
						}
					/>
					<CurrencyInput
						aria-label="Valor da posição"
						placeholder="R$ 0,00"
						value={centsToDecimal(line.amount)}
						onValueChange={(value) =>
							updateLine(index, { amount: toCents(value) })
						}
					/>
					<Select
						value={line.liquidity}
						onValueChange={(liquidity) =>
							updateLine(index, {
								liquidity: liquidity as LiquidityKind,
								maturityMonth: null,
							})
						}
					>
						<SelectTrigger aria-label="Liquidez" className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{Object.entries(LIQUIDITY_LABEL).map(([value, label]) => (
								<SelectItem key={value} value={value}>
									{label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					{line.liquidity === "maturity" ? (
						<Input
							type="month"
							aria-label="Mês de vencimento"
							value={line.maturityMonth ?? ""}
							onChange={(event) =>
								updateLine(index, { maturityMonth: event.target.value || null })
							}
						/>
					) : (
						<span />
					)}
					<Input
						type="number"
						step="0.01"
						aria-label="Retorno real % a.a."
						placeholder="% a.a."
						value={line.annualRealReturnPct ?? ""}
						onChange={(event) =>
							updateLine(index, {
								annualRealReturnPct:
									event.target.value === "" ? null : Number(event.target.value),
							})
						}
					/>
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						aria-label="Remover posição"
						onClick={() => onLinesChange(lines.filter((_, i) => i !== index))}
					>
						<RiDeleteBinLine className="size-4" />
					</Button>
				</div>
			))}

			<div className="flex flex-wrap items-center justify-between gap-2">
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={() => onLinesChange([...lines, { ...EMPTY_LINE }])}
				>
					<RiAddLine className="size-4" />
					Adicionar posição
				</Button>
				<Button
					type="button"
					size="sm"
					disabled={isPending}
					onClick={saveAccount}
				>
					Salvar conta
				</Button>
			</div>
		</section>
	);
}
