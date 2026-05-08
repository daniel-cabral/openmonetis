import {
	calculateLastInstallmentDate,
	formatCurrentInstallment,
	formatLastInstallmentDate,
	formatPurchaseDate,
} from "@/shared/lib/installments/utils";

type InstallmentTimelineProps = {
	purchaseDate: Date;
	currentInstallment: number;
	totalInstallments: number;
	period: string;
};

export function InstallmentTimeline({
	purchaseDate,
	currentInstallment,
	totalInstallments,
	period,
}: InstallmentTimelineProps) {
	const lastInstallmentDate = calculateLastInstallmentDate(
		period,
		currentInstallment,
		totalInstallments,
	);

	const progress =
		totalInstallments > 1
			? ((currentInstallment - 1) / (totalInstallments - 1)) * 100
			: 100;

	const remaining = totalInstallments - currentInstallment;
	const isLast = currentInstallment === totalInstallments;

	return (
		<div className="flex flex-col gap-3 py-1">
			<div className="flex items-start justify-between text-xs">
				<div className="flex flex-col gap-0.5">
					<span className="text-muted-foreground">Compra</span>
					<span className="font-medium text-foreground">
						{formatPurchaseDate(purchaseDate)}
					</span>
				</div>
				<div className="flex flex-col items-end gap-0.5">
					<span className="text-muted-foreground">Quitação estimada</span>
					<span className="font-medium text-foreground">
						{formatLastInstallmentDate(lastInstallmentDate)}
					</span>
				</div>
			</div>

			<div className="relative h-1.5 rounded-full bg-border">
				<div
					className="absolute left-0 top-0 h-full rounded-full bg-success transition-all duration-300"
					style={{ width: `${progress}%` }}
				/>
				<div
					className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-success bg-background shadow-sm transition-all duration-300"
					style={{ left: `clamp(6px, ${progress}%, calc(100% - 6px))` }}
				/>
			</div>

			<div className="flex items-center justify-between text-xs">
				<span className="font-semibold text-foreground">
					{formatCurrentInstallment(currentInstallment, totalInstallments)}
				</span>
				<span className="text-muted-foreground">
					{isLast
						? "Última parcela"
						: `${remaining} restante${remaining > 1 ? "s" : ""}`}
				</span>
			</div>
		</div>
	);
}
