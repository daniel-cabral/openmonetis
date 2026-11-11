import type { PaidAfterEnd } from "@/features/transactions/lib/reconciliation-projection";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/shared/components/ui/popover";
import { formatCurrency } from "@/shared/utils/currency";
import { formatDateOnly } from "@/shared/utils/date";

export type ApplyProjection = {
	label: string;
	projected: number;
	targetLabel: string;
	target: number | null;
	unavailableText: string;
};

interface ReconciliationApplyBarProps {
	projection: ApplyProjection | null;
	paidAfterEnd: PaidAfterEnd[];
	suspiciousCount: number;
	blockReason: string | null;
	canApply: boolean;
	isApplying: boolean;
	onApply: () => void;
}

const shortDate = (date: string) =>
	formatDateOnly(date, { year: undefined, month: "2-digit" }) ?? date;

export function ReconciliationApplyBar({
	projection,
	paidAfterEnd,
	suspiciousCount,
	blockReason,
	canApply,
	isApplying,
	onApply,
}: ReconciliationApplyBarProps) {
	const matches =
		projection !== null &&
		projection.target !== null &&
		Math.round(projection.projected * 100) ===
			Math.round(projection.target * 100);

	return (
		<div className="bg-background/95 sticky bottom-0 flex flex-col gap-2 border-t py-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
			<div className="flex flex-col gap-1 text-sm">
				{projection && (
					<div className="flex flex-wrap items-center gap-2">
						{projection.target !== null &&
							(matches ? (
								<Badge variant="success">Bate</Badge>
							) : (
								<Badge className="bg-warning text-warning-foreground">
									Diferença de{" "}
									{formatCurrency(
										Math.abs(
											Math.round(projection.target * 100) -
												Math.round(projection.projected * 100),
										) / 100,
									)}
								</Badge>
							))}
						<span>
							{projection.label}:{" "}
							<b>{formatCurrency(projection.projected)}</b>
							{" · "}
							{projection.target !== null ? (
								<>
									{projection.targetLabel}:{" "}
									<b>{formatCurrency(projection.target)}</b>
								</>
							) : (
								projection.unavailableText
							)}
						</span>
					</div>
				)}
				{paidAfterEnd.length > 0 && (
					<span className="text-muted-foreground text-xs">
						{paidAfterEnd.length} lançamento(s) pago(s) depois do fim do arquivo
						·{" "}
						<Popover>
							<PopoverTrigger asChild>
								<button type="button" className="underline">
									ver
								</button>
							</PopoverTrigger>
							<PopoverContent className="w-72">
								<ul className="flex flex-col gap-1 text-xs">
									{paidAfterEnd.map((paid) => (
										<li key={paid.id} className="flex justify-between gap-2">
											<span>
												{paid.name} ({shortDate(paid.date)})
											</span>
											<span>{formatCurrency(paid.amount)}</span>
										</li>
									))}
								</ul>
							</PopoverContent>
						</Popover>
					</span>
				)}
			</div>
			<div className="flex flex-wrap items-center justify-end gap-3">
				{suspiciousCount > 0 && (
					<span className="text-warning text-sm">
						{suspiciousCount} casamento(s) suspeito(s)
					</span>
				)}
				{blockReason && (
					<span className="text-destructive text-xs">{blockReason}</span>
				)}
				<Button disabled={!canApply} onClick={onApply}>
					{isApplying ? "Aplicando…" : "Aplicar"}
				</Button>
			</div>
		</div>
	);
}
