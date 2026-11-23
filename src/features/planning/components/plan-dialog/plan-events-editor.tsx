"use client";

import { RiAddLine, RiDeleteBinLine, RiPencilLine } from "@remixicon/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
	deletePlanEventAction,
	savePlanEventAction,
} from "@/features/planning/actions";
import { formatCents } from "@/features/planning/lib/cents";
import type { Period, PlanEventInput } from "@/features/planning/lib/engine";
import {
	emptyEventForm,
	eventFormToInput,
	eventToForm,
	type PlanEventFormValues,
} from "@/features/planning/lib/plan-form";
import type { PlanView } from "@/features/planning/lib/snapshot-types";
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
import { displayPeriod } from "@/shared/utils/period";
import { MonthField } from "./common-fields";

function periodLabel(event: PlanEventInput): string {
	if (event.endMonth === event.startMonth) {
		return displayPeriod(event.startMonth);
	}
	const end = event.endMonth ? displayPeriod(event.endMonth) : "sem fim";
	return `${displayPeriod(event.startMonth)} até ${end}`;
}

export function PlanEventsEditor({
	plan,
	currentMonth,
}: {
	plan: PlanView;
	currentMonth: Period;
}) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [form, setForm] = useState<PlanEventFormValues | null>(null);

	const patch = (next: Partial<PlanEventFormValues>) =>
		setForm((current) => (current ? { ...current, ...next } : current));

	const handleSave = () => {
		if (!form) {
			return;
		}
		const input = eventFormToInput(form, plan.id);

		startTransition(async () => {
			const result = await savePlanEventAction(input);

			if (result.success) {
				toast.success(result.message);
				setForm(null);
				router.refresh();
				return;
			}

			toast.error(result.error);
		});
	};

	const handleDelete = (eventId: string) => {
		startTransition(async () => {
			const result = await deletePlanEventAction({ id: eventId });

			if (result.success) {
				toast.success(result.message);
				router.refresh();
				return;
			}

			toast.error(result.error);
		});
	};

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between gap-3">
				<p className="text-sm font-medium">Eventos do plano</p>
				{form ? null : (
					<Button
						type="button"
						variant="outline"
						size="sm"
						disabled={isPending}
						onClick={() => setForm(emptyEventForm(currentMonth))}
					>
						<RiAddLine className="size-4" />
						Novo evento
					</Button>
				)}
			</div>

			{plan.events.length === 0 ? (
				<p className="text-sm text-muted-foreground">
					Nenhum evento neste plano.
				</p>
			) : (
				<ul className="divide-y">
					{plan.events.map((event) => (
						<li
							key={event.id}
							className="flex items-center justify-between gap-3 py-2"
						>
							<div className="min-w-0">
								<p className="truncate text-sm font-medium">{event.label}</p>
								<p className="text-xs text-muted-foreground">
									{periodLabel(event)} ·{" "}
									{event.direction === "outflow" ? "Saída" : "Entrada"}
								</p>
							</div>
							<div className="flex items-center gap-1">
								<span className="text-sm tabular-nums">
									{formatCents(event.amount.base)}
								</span>
								<Button
									type="button"
									variant="ghost"
									size="icon-sm"
									aria-label="Editar evento"
									disabled={isPending}
									onClick={() => setForm(eventToForm(event))}
								>
									<RiPencilLine className="size-4" />
								</Button>
								<Button
									type="button"
									variant="ghost"
									size="icon-sm"
									aria-label="Excluir evento"
									disabled={isPending}
									onClick={() => handleDelete(event.id)}
								>
									<RiDeleteBinLine className="size-4" />
								</Button>
							</div>
						</li>
					))}
				</ul>
			)}

			{form ? (
				<div className="space-y-4 rounded-md border p-4">
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="space-y-2">
							<Label htmlFor="event-kind">Tipo</Label>
							<Select
								value={form.kind}
								onValueChange={(kind) =>
									patch({ kind: kind as PlanEventFormValues["kind"] })
								}
							>
								<SelectTrigger id="event-kind" className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="one-off">Pagamento único</SelectItem>
									<SelectItem value="recurring">Mudança recorrente</SelectItem>
								</SelectContent>
							</Select>
						</div>

						<div className="space-y-2">
							<Label htmlFor="event-direction">Direção</Label>
							<Select
								value={form.direction}
								onValueChange={(direction) =>
									patch({
										direction: direction as PlanEventFormValues["direction"],
									})
								}
							>
								<SelectTrigger id="event-direction" className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="outflow">Saída</SelectItem>
									<SelectItem value="inflow">Entrada</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</div>

					<div className="space-y-2">
						<Label htmlFor="event-label">Descrição</Label>
						<Input
							id="event-label"
							value={form.label}
							onChange={(event) => patch({ label: event.target.value })}
						/>
					</div>

					<div className="flex items-center justify-between gap-3">
						<Label htmlFor="event-has-range">Faixa (mín, base, máx)</Label>
						<Switch
							id="event-has-range"
							checked={form.hasRange}
							onCheckedChange={(hasRange) => patch({ hasRange })}
						/>
					</div>

					{form.hasRange ? (
						<div className="grid gap-4 sm:grid-cols-3">
							<div className="space-y-2">
								<Label htmlFor="event-amount-min">Mínimo</Label>
								<CurrencyInput
									id="event-amount-min"
									value={form.amountMin}
									onValueChange={(amountMin) => patch({ amountMin })}
									placeholder="R$ 0,00"
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="event-amount-base">Base</Label>
								<CurrencyInput
									id="event-amount-base"
									value={form.amountBase}
									onValueChange={(amountBase) => patch({ amountBase })}
									placeholder="R$ 0,00"
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="event-amount-max">Máximo</Label>
								<CurrencyInput
									id="event-amount-max"
									value={form.amountMax}
									onValueChange={(amountMax) => patch({ amountMax })}
									placeholder="R$ 0,00"
								/>
							</div>
						</div>
					) : (
						<div className="space-y-2">
							<Label htmlFor="event-amount-base">Valor</Label>
							<CurrencyInput
								id="event-amount-base"
								value={form.amountBase}
								onValueChange={(amountBase) => patch({ amountBase })}
								placeholder="R$ 0,00"
							/>
						</div>
					)}

					<div className="grid gap-4 sm:grid-cols-2">
						<div className="space-y-2">
							<Label htmlFor="event-start">Mês inicial</Label>
							<MonthField
								id="event-start"
								value={form.startMonth}
								onChange={(startMonth) => patch({ startMonth })}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="event-basis">Valor em</Label>
							<Select
								value={form.basis}
								onValueChange={(basis) =>
									patch({ basis: basis as PlanEventFormValues["basis"] })
								}
							>
								<SelectTrigger id="event-basis" className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="today">Dinheiro de hoje</SelectItem>
									<SelectItem value="nominal">Valor nominal</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</div>

					{form.kind === "recurring" ? (
						<div className="space-y-3">
							<div className="flex items-center justify-between gap-3">
								<Label htmlFor="event-has-end">Tem data de fim</Label>
								<Switch
									id="event-has-end"
									checked={form.hasEnd}
									onCheckedChange={(hasEnd) => patch({ hasEnd })}
								/>
							</div>
							{form.hasEnd ? (
								<div className="space-y-2">
									<Label htmlFor="event-end">Fim</Label>
									<MonthField
										id="event-end"
										value={form.endMonth}
										onChange={(endMonth) => patch({ endMonth })}
									/>
								</div>
							) : null}
						</div>
					) : null}

					<div className="flex justify-end gap-2">
						<Button
							type="button"
							variant="outline"
							onClick={() => setForm(null)}
							disabled={isPending}
						>
							Cancelar
						</Button>
						<Button type="button" onClick={handleSave} disabled={isPending}>
							{isPending ? "Salvando..." : "Salvar evento"}
						</Button>
					</div>
				</div>
			) : null}
		</div>
	);
}
