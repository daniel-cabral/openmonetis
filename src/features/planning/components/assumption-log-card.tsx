"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState, useTransition } from "react";
import { toast } from "sonner";
import { addAssumptionAction } from "@/features/planning/actions";
import {
	ASSUMPTION_KIND_LABEL,
	SOURCE_LABEL,
} from "@/features/planning/lib/labels";
import type { AssumptionInput } from "@/features/planning/lib/schemas";
import type { AssumptionView } from "@/features/planning/lib/snapshot-types";
import { Button } from "@/shared/components/ui/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/shared/components/ui/card";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import { formatShortPeriodLabel } from "@/shared/utils/period";

export function AssumptionLogCard({
	assumptions,
}: {
	assumptions: AssumptionView[];
}) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [kind, setKind] = useState<AssumptionInput["kind"]>("other");
	const [summary, setSummary] = useState("");
	const [reviewByMonth, setReviewByMonth] = useState("");

	const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		startTransition(async () => {
			const result = await addAssumptionAction({
				kind,
				summary,
				reviewByMonth: reviewByMonth || null,
			});

			if (result.success) {
				toast.success(result.message);
				setSummary("");
				setReviewByMonth("");
				router.refresh();
				return;
			}

			toast.error(result.error);
		});
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>Premissas e decisões</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				{assumptions.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						Nenhuma premissa registrada.
					</p>
				) : (
					<ul className="space-y-3">
						{assumptions.map((item) => (
							<li key={item.id} className="text-sm">
								<p className="text-xs text-muted-foreground">
									{new Date(item.createdAt).toLocaleDateString("pt-BR")} ·{" "}
									{ASSUMPTION_KIND_LABEL[item.kind] ?? item.kind} ·{" "}
									{SOURCE_LABEL[item.source]}
								</p>
								<p>{item.summary}</p>
								{item.reviewByMonth ? (
									<p className="text-xs text-muted-foreground">
										revisar em {formatShortPeriodLabel(item.reviewByMonth)}
									</p>
								) : null}
							</li>
						))}
					</ul>
				)}
				<form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2">
					<div className="space-y-2">
						<Label htmlFor="assumption-kind">Tipo</Label>
						<Select
							value={kind}
							onValueChange={(next) => setKind(next as AssumptionInput["kind"])}
						>
							<SelectTrigger id="assumption-kind" className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{Object.entries(ASSUMPTION_KIND_LABEL).map(([value, label]) => (
									<SelectItem key={value} value={value}>
										{label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-2">
						<Label htmlFor="assumption-review">Revisar em (opcional)</Label>
						<Input
							id="assumption-review"
							type="month"
							value={reviewByMonth}
							onChange={(event) => setReviewByMonth(event.target.value)}
						/>
					</div>
					<div className="space-y-2 sm:col-span-2">
						<Label htmlFor="assumption-summary">Descrição</Label>
						<Input
							id="assumption-summary"
							maxLength={300}
							value={summary}
							onChange={(event) => setSummary(event.target.value)}
						/>
					</div>
					<div className="flex justify-end sm:col-span-2">
						<Button type="submit" disabled={isPending || summary.trim() === ""}>
							Registrar premissa
						</Button>
					</div>
				</form>
			</CardContent>
		</Card>
	);
}
