import {
	RiArrowDownSLine,
	RiArrowUpSLine,
	RiDeleteBinLine,
	RiPencilLine,
} from "@remixicon/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
	deletePlanAction,
	reorderPlansAction,
} from "@/features/planning/actions";
import type { PlanView } from "@/features/planning/lib/snapshot-types";
import type { PlanRow } from "@/features/planning/lib/view-model";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/shared/components/ui/alert-dialog";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/shared/components/ui/card";
import { Progress } from "@/shared/components/ui/progress";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/shared/components/ui/table";
import { formatShortPeriodLabel } from "@/shared/utils/period";
import { HealthBadge } from "./health-badge";

const KIND_LABEL = {
	reserve: "Reserva",
	goal: "Objetivo",
	consorcio: "Consórcio",
} as const;

export function PlansTable({
	rows,
	plans,
	onEdit,
}: {
	rows: PlanRow[];
	plans: PlanView[];
	onEdit: (planId: string) => void;
}) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [pendingDelete, setPendingDelete] = useState<PlanRow | null>(null);
	const visibleIds = rows
		.filter((row) => row.kind !== "reserve")
		.map((row) => row.id);

	// Reorder works on every plan, including paused and done ones that the
	// table hides, so swap the two rows inside the full priority list.
	const handleMove = (planId: string, direction: -1 | 1) => {
		const neighborId = visibleIds[visibleIds.indexOf(planId) + direction];
		if (!neighborId) {
			return;
		}

		const orderedIds = [...plans]
			.sort((a, b) => a.priority - b.priority)
			.map((plan) => plan.id);
		const from = orderedIds.indexOf(planId);
		const to = orderedIds.indexOf(neighborId);
		[orderedIds[from], orderedIds[to]] = [orderedIds[to], orderedIds[from]];

		startTransition(async () => {
			const result = await reorderPlansAction({ orderedIds });

			if (result.success) {
				toast.success(result.message);
				router.refresh();
				return;
			}

			toast.error(result.error);
		});
	};

	const handleDelete = (planId: string) => {
		startTransition(async () => {
			const result = await deletePlanAction({ id: planId });

			if (result.success) {
				toast.success(result.message);
				router.refresh();
				return;
			}

			toast.error(result.error);
		});
	};

	return (
		<>
			<Card>
				<CardHeader>
					<CardTitle>Planos</CardTitle>
				</CardHeader>
				<CardContent>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Prioridade</TableHead>
								<TableHead>Plano</TableHead>
								<TableHead>Tipo</TableHead>
								<TableHead>Mês</TableHead>
								<TableHead>Cobertura</TableHead>
								<TableHead>Status</TableHead>
								<TableHead>
									<span className="sr-only">Ações</span>
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows.map((row) => (
								<TableRow key={row.id}>
									<TableCell>
										{row.kind === "reserve" ? "—" : row.priority}
									</TableCell>
									<TableCell>
										<div className="flex items-center gap-2">
											{onEdit && row.kind !== "reserve" ? (
												<button
													type="button"
													className="text-left font-medium hover:underline"
													onClick={() => onEdit(row.id)}
												>
													{row.name}
												</button>
											) : (
												<span className="font-medium">{row.name}</span>
											)}
											{row.nonNegotiable ? (
												<Badge variant="outline">Inegociável</Badge>
											) : null}
										</div>
									</TableCell>
									<TableCell>{KIND_LABEL[row.kind]}</TableCell>
									<TableCell>
										{row.month ? formatShortPeriodLabel(row.month) : "—"}
									</TableCell>
									<TableCell>
										<div className="flex items-center gap-2">
											<Progress value={row.coveragePct} className="w-24" />
											<span className="text-xs tabular-nums">
												{row.coveragePct}%
											</span>
										</div>
									</TableCell>
									<TableCell>
										<HealthBadge health={row.health} />
									</TableCell>
									<TableCell>
										{row.kind === "reserve" ? null : (
											<div className="flex items-center justify-end gap-1">
												<Button
													type="button"
													variant="ghost"
													size="icon-sm"
													aria-label="Editar plano"
													disabled={isPending}
													onClick={() => onEdit(row.id)}
												>
													<RiPencilLine className="size-4" />
												</Button>
												<Button
													type="button"
													variant="ghost"
													size="icon-sm"
													aria-label="Subir plano"
													disabled={isPending || visibleIds[0] === row.id}
													onClick={() => handleMove(row.id, -1)}
												>
													<RiArrowUpSLine className="size-4" />
												</Button>
												<Button
													type="button"
													variant="ghost"
													size="icon-sm"
													aria-label="Descer plano"
													disabled={
														isPending ||
														visibleIds[visibleIds.length - 1] === row.id
													}
													onClick={() => handleMove(row.id, 1)}
												>
													<RiArrowDownSLine className="size-4" />
												</Button>
												<Button
													type="button"
													variant="ghost"
													size="icon-sm"
													aria-label="Excluir plano"
													disabled={isPending}
													onClick={() => setPendingDelete(row)}
												>
													<RiDeleteBinLine className="size-4" />
												</Button>
											</div>
										)}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</CardContent>
			</Card>

			<AlertDialog
				open={pendingDelete !== null}
				onOpenChange={(open) => {
					if (!open) {
						setPendingDelete(null);
					}
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Excluir plano?</AlertDialogTitle>
						<AlertDialogDescription>
							{pendingDelete
								? `"${pendingDelete.name}" será removido. Essa ação não pode ser desfeita.`
								: null}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancelar</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => {
								if (pendingDelete) {
									handleDelete(pendingDelete.id);
								}
								setPendingDelete(null);
							}}
						>
							Excluir
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
