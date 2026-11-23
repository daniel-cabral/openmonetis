"use client";

import type { PlanLifecycle, Period } from "@/features/planning/lib/engine";
import type { PlanFormValues } from "@/features/planning/lib/plan-form";
import type { InvestmentAccountView } from "@/features/planning/lib/snapshot-types";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { MonthPicker } from "@/shared/components/ui/month-picker";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/shared/components/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import { Switch } from "@/shared/components/ui/switch";
import {
	dateToPeriod,
	displayPeriod,
	periodToDate,
} from "@/shared/utils/period";

export type PatchPlanForm = (next: Partial<PlanFormValues>) => void;

const LIFECYCLE_OPTIONS: { value: PlanLifecycle; label: string }[] = [
	{ value: "draft", label: "Rascunho" },
	{ value: "active", label: "Ativo" },
	{ value: "paused", label: "Pausado" },
	{ value: "done", label: "Concluído" },
	{ value: "abandoned", label: "Abandonado" },
];

function MonthField({
	id,
	value,
	onChange,
}: {
	id: string;
	value: Period;
	onChange: (value: Period) => void;
}) {
	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button
					id={id}
					type="button"
					variant="outline"
					className="w-full justify-start font-normal"
				>
					{displayPeriod(value)}
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-auto p-0" align="start">
				<MonthPicker
					selectedMonth={periodToDate(value)}
					onMonthSelect={(date) => onChange(dateToPeriod(date))}
				/>
			</PopoverContent>
		</Popover>
	);
}

export function CommonFields({
	values,
	patch,
	potAccounts,
}: {
	values: PlanFormValues;
	patch: PatchPlanForm;
	potAccounts: InvestmentAccountView[];
}) {
	const togglePot = (accountId: string, checked: boolean) =>
		patch({
			potAccountIds: checked
				? [...values.potAccountIds, accountId]
				: values.potAccountIds.filter((id) => id !== accountId),
		});

	return (
		<div className="space-y-4">
			<div className="space-y-2">
				<Label htmlFor="plan-name">Nome</Label>
				<Input
					id="plan-name"
					value={values.name}
					onChange={(event) => patch({ name: event.target.value })}
				/>
			</div>

			<div className="flex items-center justify-between gap-3">
				<Label htmlFor="plan-non-negotiable">Inegociável</Label>
				<Switch
					id="plan-non-negotiable"
					checked={values.nonNegotiable}
					onCheckedChange={(nonNegotiable) => patch({ nonNegotiable })}
				/>
			</div>

			<div className="grid gap-4 sm:grid-cols-2">
				<div className="space-y-2">
					<Label htmlFor="plan-lifecycle">Status</Label>
					<Select
						value={values.lifecycle}
						onValueChange={(lifecycle) =>
							patch({ lifecycle: lifecycle as PlanLifecycle })
						}
					>
						<SelectTrigger id="plan-lifecycle" className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{LIFECYCLE_OPTIONS.map((option) => (
								<SelectItem key={option.value} value={option.value}>
									{option.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<div className="space-y-2">
					<Label htmlFor="plan-basis">Valor em</Label>
					<Select
						value={values.basis}
						onValueChange={(basis) =>
							patch({ basis: basis as PlanFormValues["basis"] })
						}
					>
						<SelectTrigger id="plan-basis" className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="today">Dinheiro de hoje</SelectItem>
							<SelectItem value="nominal">Valor nominal</SelectItem>
						</SelectContent>
					</Select>
				</div>

				<div className="space-y-2">
					<Label htmlFor="plan-index">Índice</Label>
					<Select
						value={values.index}
						onValueChange={(index) =>
							patch({ index: index as PlanFormValues["index"] })
						}
					>
						<SelectTrigger id="plan-index" className="w-full">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="IPCA">IPCA</SelectItem>
							<SelectItem value="INCC">INCC</SelectItem>
						</SelectContent>
					</Select>
				</div>

				<div className="space-y-2">
					<Label htmlFor="plan-target-month">Mês alvo</Label>
					<MonthField
						id="plan-target-month"
						value={values.targetMonth}
						onChange={(targetMonth) => patch({ targetMonth })}
					/>
				</div>
			</div>

			<div className="space-y-3">
				<div className="flex items-center justify-between gap-3">
					<Label htmlFor="plan-has-window">Janela flexível</Label>
					<Switch
						id="plan-has-window"
						checked={values.hasWindow}
						onCheckedChange={(hasWindow) => patch({ hasWindow })}
					/>
				</div>
				{values.hasWindow ? (
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="space-y-2">
							<Label htmlFor="plan-window-earliest">Mais cedo</Label>
							<MonthField
								id="plan-window-earliest"
								value={values.windowEarliest}
								onChange={(windowEarliest) => patch({ windowEarliest })}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="plan-window-latest">Mais tarde</Label>
							<MonthField
								id="plan-window-latest"
								value={values.windowLatest}
								onChange={(windowLatest) => patch({ windowLatest })}
							/>
						</div>
					</div>
				) : null}
			</div>

			<div className="space-y-2">
				<Label>Potes que podem pagar</Label>
				{potAccounts.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						Nenhuma conta marcada como pote.
					</p>
				) : (
					<div className="grid gap-2 sm:grid-cols-2">
						{potAccounts.map((account) => (
							<div key={account.id} className="flex items-center gap-2">
								<Checkbox
									id={`plan-pot-${account.id}`}
									checked={values.potAccountIds.includes(account.id)}
									onCheckedChange={(checked) =>
										togglePot(account.id, checked === true)
									}
								/>
								<Label htmlFor={`plan-pot-${account.id}`}>{account.name}</Label>
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
