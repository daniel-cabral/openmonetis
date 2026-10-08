"use client";

import { RiBankCard2Line, RiBankLine } from "@remixicon/react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { linkTransactionsToTripAction } from "@/features/trips/actions";
import {
	buildSourceOptions,
	filterBySource,
	paginate,
	type SuggestionSource,
} from "@/features/trips/lib/suggestion-view";
import type { TripTransactionRow } from "@/features/trips/lib/summary";
import { Button } from "@/shared/components/ui/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/shared/components/ui/card";
import { Checkbox } from "@/shared/components/ui/checkbox";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/shared/components/ui/table";
import { formatCurrency } from "@/shared/utils/currency";
import { formatDateOnly } from "@/shared/utils/date";

const RECURRING_CONDITION = "Recorrente";

const installmentLabel = (row: TripTransactionRow) =>
	row.currentInstallment && row.installmentCount
		? ` (${row.currentInstallment}/${row.installmentCount})`
		: "";

function SourceCell({ row }: { row: TripTransactionRow }) {
	if (row.cardId) {
		return (
			<span className="inline-flex items-center gap-1">
				<RiBankCard2Line
					className="size-3.5 text-muted-foreground"
					aria-hidden
				/>
				{row.cardName}
			</span>
		);
	}
	if (row.accountId) {
		return (
			<span className="inline-flex items-center gap-1">
				<RiBankLine className="size-3.5 text-muted-foreground" aria-hidden />
				{row.accountName}
			</span>
		);
	}
	return <span className="text-muted-foreground">-</span>;
}

export function TripSuggestions({
	tripId,
	rows,
}: {
	tripId: string;
	rows: TripTransactionRow[];
}) {
	const [source, setSource] = useState<SuggestionSource>("all");
	const [page, setPage] = useState(1);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [isPending, startTransition] = useTransition();

	const sourceOptions = useMemo(() => buildSourceOptions(rows), [rows]);
	const filtered = useMemo(() => filterBySource(rows, source), [rows, source]);
	const view = paginate(filtered, page);

	const pageIds = view.items.map((row) => row.id);
	const pageSelectedCount = pageIds.filter((id) => selected.has(id)).length;
	const pageAllSelected =
		pageIds.length > 0 && pageSelectedCount === pageIds.length;
	const filteredAllSelected =
		filtered.length > 0 && filtered.every((row) => selected.has(row.id));

	const toggle = (id: string, checked: boolean) =>
		setSelected((prev) => {
			const next = new Set(prev);
			if (checked) next.add(id);
			else next.delete(id);
			return next;
		});

	const togglePage = (checked: boolean) =>
		setSelected((prev) => {
			const next = new Set(prev);
			for (const id of pageIds) {
				if (checked) next.add(id);
				else next.delete(id);
			}
			return next;
		});

	const selectAllFiltered = () =>
		setSelected(new Set(filtered.map((row) => row.id)));

	const changeSource = (value: SuggestionSource) => {
		setSource(value);
		setPage(1);
		setSelected(new Set());
	};

	const linkSelected = () =>
		startTransition(async () => {
			const result = await linkTransactionsToTripAction({
				tripId,
				transactionIds: [...selected],
			});
			if (!result.success) {
				toast.error(result.error);
				return;
			}
			toast.success(result.message);
			setSelected(new Set());
		});

	return (
		<Card>
			<CardHeader className="pb-2">
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div>
						<CardTitle className="text-sm font-medium">
							Sugestões ({rows.length})
						</CardTitle>
						<p className="text-xs text-muted-foreground">
							Lançamentos sem viagem com data da compra no período, de cartões e
							contas.
						</p>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<Select value={source} onValueChange={changeSource}>
							<SelectTrigger size="sm" className="w-48" aria-label="Origem">
								<SelectValue placeholder="Origem" />
							</SelectTrigger>
							<SelectContent>
								{sourceOptions.map((option) => (
									<SelectItem key={option.value} value={option.value}>
										{option.value === "all" ? "Origem: Todos" : option.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<Button
							size="sm"
							disabled={selected.size === 0 || isPending}
							onClick={linkSelected}
						>
							{selected.size === 0
								? "Vincular selecionados"
								: `Vincular ${selected.size} selecionado${selected.size === 1 ? "" : "s"}`}
						</Button>
					</div>
				</div>
			</CardHeader>
			<CardContent className="space-y-3">
				{filtered.length === 0 ? (
					<p className="text-sm text-muted-foreground">Nenhuma sugestão.</p>
				) : (
					<>
						{pageAllSelected && !filteredAllSelected ? (
							<div className="rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-xs">
								Os {pageIds.length} desta página estão selecionados.{" "}
								<button
									type="button"
									className="font-semibold text-primary hover:underline"
									onClick={selectAllFiltered}
								>
									Selecionar todos os {filtered.length} do filtro
								</button>
							</div>
						) : null}
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="w-8">
										<Checkbox
											aria-label="Selecionar a página"
											checked={
												pageAllSelected
													? true
													: pageSelectedCount > 0
														? "indeterminate"
														: false
											}
											onCheckedChange={(checked) =>
												togglePage(checked === true)
											}
										/>
									</TableHead>
									<TableHead>Data</TableHead>
									<TableHead>Descrição</TableHead>
									<TableHead>Origem</TableHead>
									<TableHead>Categoria</TableHead>
									<TableHead className="text-right">Valor</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{view.items.map((row) => (
									<TableRow key={row.id}>
										<TableCell>
											<Checkbox
												id={`suggestion-${row.id}`}
												checked={selected.has(row.id)}
												onCheckedChange={(checked) =>
													toggle(row.id, checked === true)
												}
											/>
										</TableCell>
										<TableCell className="whitespace-nowrap">
											{formatDateOnly(row.purchaseDate)}
										</TableCell>
										<TableCell>
											<label htmlFor={`suggestion-${row.id}`}>
												{row.name}
												{installmentLabel(row)}
											</label>
											{row.condition === RECURRING_CONDITION ? (
												<span className="ml-2 rounded-full border px-1.5 text-[10px] text-muted-foreground">
													recorrente
												</span>
											) : null}
										</TableCell>
										<TableCell>
											<SourceCell row={row} />
										</TableCell>
										<TableCell>{row.categoryName ?? "-"}</TableCell>
										<TableCell className="text-right tabular-nums">
											{formatCurrency(row.amount)}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
						<div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
							<span>
								{view.from} a {view.to} de {view.total}
							</span>
							<div className="flex items-center gap-2">
								<Button
									variant="outline"
									size="sm"
									disabled={view.page <= 1}
									onClick={() => setPage(view.page - 1)}
								>
									Anterior
								</Button>
								<span>
									Página {view.page} de {view.pageCount}
								</span>
								<Button
									variant="outline"
									size="sm"
									disabled={view.page >= view.pageCount}
									onClick={() => setPage(view.page + 1)}
								>
									Próxima
								</Button>
							</div>
						</div>
					</>
				)}
			</CardContent>
		</Card>
	);
}
