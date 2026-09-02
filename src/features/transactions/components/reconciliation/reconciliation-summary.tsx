import type { ReconciliationSummary as Buckets } from "@/features/transactions/lib/reconciliation-review";
import { Badge } from "@/shared/components/ui/badge";
import { Card } from "@/shared/components/ui/card";
import type {
	InvoiceClosureResult,
	StatementClosureResult,
} from "@/shared/lib/reconciliation/closure";
import { formatCurrency } from "@/shared/utils/currency";

interface ReconciliationSummaryProps {
	buckets: Buckets;
	closure:
		| { kind: "statement"; result: StatementClosureResult }
		| { kind: "invoice"; result: InvoiceClosureResult }
		| null;
}

const BUCKET_LABELS: { key: keyof Buckets; label: string }[] = [
	{ key: "matched", label: "Casadas" },
	{ key: "bankOnly", label: "Só no banco" },
	{ key: "appOnly", label: "Só no app" },
	{ key: "ambiguous", label: "Ambíguas" },
];

export function ReconciliationSummary({
	buckets,
	closure,
}: ReconciliationSummaryProps) {
	return (
		<Card className="flex flex-col gap-4 p-5 text-sm shadow-none">
			<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
				{BUCKET_LABELS.map(({ key, label }) => (
					<div key={key} className="flex flex-col gap-1 rounded-lg border p-3">
						<span className="text-muted-foreground text-xs">{label}</span>
						<span className="text-xl font-semibold">{buckets[key]}</span>
					</div>
				))}
			</div>

			{closure ? (
				<div className="flex flex-col gap-1 border-t pt-3">
					{closure.kind === "statement" ? (
						<StatementClosurePanel result={closure.result} />
					) : (
						<InvoiceClosurePanel result={closure.result} />
					)}
				</div>
			) : null}
		</Card>
	);
}

function StatementClosurePanel({ result }: { result: StatementClosureResult }) {
	if (result.closes) {
		return (
			<div className="flex items-center gap-2">
				<Badge className="bg-emerald-600 text-white dark:bg-emerald-500">
					Fecha
				</Badge>
				<span className="text-muted-foreground">
					Todos os dias contábeis batem com o saldo do extrato.
				</span>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center gap-2">
				<Badge variant="destructive">Não fecha</Badge>
				<span className="text-muted-foreground">
					{result.divergences.length} dia
					{result.divergences.length !== 1 ? "s" : ""} com divergência.
				</span>
			</div>
			<ul className="flex flex-col gap-1">
				{result.divergences.map((day) => (
					<li key={day.day} className="text-muted-foreground">
						{day.day}: diferença de {formatCurrency(day.difference)}
					</li>
				))}
			</ul>
		</div>
	);
}

function InvoiceClosurePanel({ result }: { result: InvoiceClosureResult }) {
	return (
		<div className="flex items-center gap-2">
			{result.closes ? (
				<Badge className="bg-emerald-600 text-white dark:bg-emerald-500">
					Fecha
				</Badge>
			) : (
				<Badge variant="destructive">Não fecha</Badge>
			)}
			<span className="text-muted-foreground">
				Compras: {formatCurrency(result.purchasesSum)} · Total informado:{" "}
				{formatCurrency(result.expectedTotal)}
				{!result.closes &&
					` · diferença de ${formatCurrency(result.difference)}`}
			</span>
		</div>
	);
}
