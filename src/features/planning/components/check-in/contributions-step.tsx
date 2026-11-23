"use client";

import { formatCents } from "@/features/planning/lib/cents";
import type { ContributionAssignment } from "@/features/planning/lib/check-in";
import type { LiquidityKind } from "@/features/planning/lib/engine";
import { LIQUIDITY_LABEL } from "@/features/planning/lib/labels";
import type {
	ContributionRow,
	InvestmentAccountView,
} from "@/features/planning/lib/snapshot-types";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";

export function ContributionsStep({
	rows,
	accounts,
	assignments,
	onChange,
}: {
	rows: ContributionRow[];
	accounts: InvestmentAccountView[];
	assignments: ContributionAssignment[];
	onChange: (index: number, next: ContributionAssignment) => void;
}) {
	if (rows.length === 0) {
		return (
			<p className="text-sm text-muted-foreground">
				Nenhum aporte registrado neste mês.
			</p>
		);
	}

	if (accounts.length === 0) {
		return (
			<p className="text-sm text-muted-foreground">
				Cadastre uma conta de investimento para receber os aportes.
			</p>
		);
	}

	return (
		<ul className="space-y-3">
			{rows.map((row, index) => {
				const assignment = assignments[index];

				return (
					<li
						key={row.id}
						className="grid gap-3 rounded-lg border p-3 sm:grid-cols-3"
					>
						<div className="flex items-center justify-between gap-3 sm:col-span-3">
							<span className="font-medium">{row.name}</span>
							<span className="tabular-nums">{formatCents(row.amount)}</span>
						</div>
						<div className="space-y-2">
							<Label htmlFor={`contribution-account-${row.id}`}>Conta</Label>
							<Select
								value={assignment.accountId}
								onValueChange={(accountId) =>
									onChange(index, { ...assignment, accountId })
								}
							>
								<SelectTrigger
									id={`contribution-account-${row.id}`}
									className="w-full"
								>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{accounts.map((account) => (
										<SelectItem key={account.id} value={account.id}>
											{account.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-2">
							<Label htmlFor={`contribution-liquidity-${row.id}`}>
								Liquidez
							</Label>
							<Select
								value={assignment.liquidity}
								onValueChange={(liquidity) =>
									onChange(index, {
										...assignment,
										liquidity: liquidity as LiquidityKind,
										maturityMonth: null,
									})
								}
							>
								<SelectTrigger
									id={`contribution-liquidity-${row.id}`}
									className="w-full"
								>
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
						</div>
						{assignment.liquidity === "maturity" ? (
							<div className="space-y-2">
								<Label htmlFor={`contribution-maturity-${row.id}`}>
									Vencimento
								</Label>
								<Input
									id={`contribution-maturity-${row.id}`}
									type="month"
									value={assignment.maturityMonth ?? ""}
									onChange={(event) =>
										onChange(index, {
											...assignment,
											maturityMonth: event.target.value || null,
										})
									}
								/>
							</div>
						) : null}
					</li>
				);
			})}
		</ul>
	);
}
