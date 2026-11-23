import type { PlanRow } from "@/features/planning/lib/view-model";
import { Badge } from "@/shared/components/ui/badge";
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
	onEdit,
}: {
	rows: PlanRow[];
	onEdit?: (planId: string) => void;
}) {
	return (
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
							</TableRow>
						))}
					</TableBody>
				</Table>
			</CardContent>
		</Card>
	);
}
