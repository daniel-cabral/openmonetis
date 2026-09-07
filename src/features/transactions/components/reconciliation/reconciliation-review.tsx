"use client";

import { useState } from "react";
import {
	CategorySelectContent,
	PayerSelectContent,
} from "@/features/transactions/components/select-items";
import type { SelectOption } from "@/features/transactions/components/types";
import type { ReconciliationRowDecision } from "@/features/transactions/lib/reconciliation-review";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Input } from "@/shared/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import type { AppTransaction, RowClassification } from "@/shared/lib/reconciliation/matcher";
import { formatCurrency } from "@/shared/utils/currency";
import { formatDate } from "@/shared/utils/date";

type BankOnlyAction = "create" | "ignore" | "skip";
type AmbiguousAction = "confirm" | "create" | "ignore" | "skip";

interface ReconciliationReviewProps {
	rows: RowClassification[];
	appOnlyTransactions: AppTransaction[];
	appTransactionsById: Map<string, AppTransaction>;
	learnedCategoryByFingerprint: Map<string, string>;
	categoryOptions: SelectOption[];
	payerOptions: SelectOption[];
	defaultPayerId: string;
	isApplying: boolean;
	onApply: (entries: { fingerprint: string; decision: ReconciliationRowDecision }[]) => void;
}

const signedAmount = (amount: number, transactionType: "income" | "expense") =>
	transactionType === "expense" ? -amount : amount;

export function ReconciliationReview({
	rows,
	appOnlyTransactions,
	appTransactionsById,
	learnedCategoryByFingerprint,
	categoryOptions,
	payerOptions,
	defaultPayerId,
	isApplying,
	onApply,
}: ReconciliationReviewProps) {
	const matchedRows = rows.filter((r) => r.status === "matched");
	const bankOnlyRows = rows.filter((r) => r.status === "bank-only");
	const ambiguousRows = rows.filter((r) => r.status === "ambiguous");

	const [confirmedByFingerprint, setConfirmedByFingerprint] = useState<
		Record<string, boolean>
	>({});
	const [bankOnlyState, setBankOnlyState] = useState<
		Record<string, { action: BankOnlyAction; categoryId: string | null; payerId: string | null; reason: string }>
	>({});
	const [ambiguousState, setAmbiguousState] = useState<
		Record<
			string,
			{
				action: AmbiguousAction;
				transactionId: string | null;
				categoryId: string | null;
				payerId: string | null;
				reason: string;
			}
		>
	>({});

	const getBankOnly = (fingerprint: string, categoryRaw: string | null | undefined) =>
		bankOnlyState[fingerprint] ?? {
			action: "create" as BankOnlyAction,
			categoryId:
				learnedCategoryByFingerprint.get(fingerprint) ??
				matchCategoryByRawLabel(categoryRaw, categoryOptions),
			payerId: null,
			reason: "",
		};

	const getAmbiguous = (fingerprint: string) =>
		ambiguousState[fingerprint] ?? {
			action: "skip" as AmbiguousAction,
			transactionId: null,
			categoryId: null,
			payerId: null,
			reason: "",
		};

	const decisions = (() => {
		const entries: { fingerprint: string; decision: ReconciliationRowDecision }[] = [];

		for (const row of matchedRows) {
			if (row.status !== "matched") continue;
			const confirmed = confirmedByFingerprint[row.fingerprint] ?? true;
			entries.push({
				fingerprint: row.fingerprint,
				decision: confirmed
					? {
							action: "confirm",
							transactionId: row.transactionId,
							descriptor: row.row.description,
						}
					: { action: "skip" },
			});
		}

		for (const row of bankOnlyRows) {
			const state = getBankOnly(row.fingerprint, row.row.categoryRaw);
			entries.push({
				fingerprint: row.fingerprint,
				decision:
					state.action === "create"
						? {
								action: "create",
								date: row.row.date,
								amount: row.row.amount,
								transactionType: row.row.transactionType,
								descriptor: row.row.description,
								name: row.row.description,
								categoryId: state.categoryId,
								payerId: state.payerId,
							}
						: state.action === "ignore"
							? { action: "ignore", reason: state.reason || "Não lançável" }
							: { action: "skip" },
			});
		}

		for (const row of ambiguousRows) {
			const state = getAmbiguous(row.fingerprint);
			entries.push({
				fingerprint: row.fingerprint,
				decision:
					state.action === "confirm" && state.transactionId
						? {
								action: "confirm",
								transactionId: state.transactionId,
								descriptor: row.row.description,
							}
						: state.action === "create"
							? {
									action: "create",
									date: row.row.date,
									amount: row.row.amount,
									transactionType: row.row.transactionType,
									descriptor: row.row.description,
									name: row.row.description,
									categoryId: state.categoryId,
									payerId: state.payerId,
								}
							: state.action === "ignore"
								? { action: "ignore", reason: state.reason || "Não lançável" }
								: { action: "skip" },
			});
		}

		return entries;
	})();

	const canApply =
		!isApplying &&
		decisions.some((entry) => entry.decision.action !== "skip");

	return (
		<div className="flex flex-col gap-6">
			<BucketSection title={`Casadas (${matchedRows.length})`}>
				{matchedRows.map((row) => {
					if (row.status !== "matched") return null;
					const app = appTransactionsById.get(row.transactionId);
					const confirmed = confirmedByFingerprint[row.fingerprint] ?? true;
					return (
						<RowCard key={row.fingerprint}>
							<div className="flex items-center gap-3">
								<Checkbox
									checked={confirmed}
									onCheckedChange={(checked) =>
										setConfirmedByFingerprint((prev) => ({
											...prev,
											[row.fingerprint]: checked === true,
										}))
									}
								/>
								<div className="flex flex-1 flex-col">
									<span className="font-medium">{row.row.description}</span>
									<span className="text-muted-foreground text-xs">
										{formatDate(row.row.date)} ·{" "}
										{formatCurrency(signedAmount(row.row.amount, row.row.transactionType))}
										{app ? ` · casada por ${row.rule}` : ""}
									</span>
								</div>
							</div>
						</RowCard>
					);
				})}
				{matchedRows.length === 0 && <EmptyBucket />}
			</BucketSection>

			<BucketSection title={`Só no banco (${bankOnlyRows.length})`}>
				{bankOnlyRows.map((row) => {
					const state = getBankOnly(row.fingerprint, row.row.categoryRaw);
					return (
						<RowCard key={row.fingerprint}>
							<div className="flex flex-col gap-2">
								<div className="flex flex-col">
									<span className="font-medium">{row.row.description}</span>
									<span className="text-muted-foreground text-xs">
										{formatDate(row.row.date)} ·{" "}
										{formatCurrency(signedAmount(row.row.amount, row.row.transactionType))}
									</span>
								</div>
								<div className="flex flex-wrap items-center gap-2">
									<Select
										value={state.action}
										onValueChange={(value) =>
											setBankOnlyState((prev) => ({
												...prev,
												[row.fingerprint]: { ...state, action: value as BankOnlyAction },
											}))
										}
									>
										<SelectTrigger className="w-40">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="create">Criar lançamento</SelectItem>
											<SelectItem value="ignore">Ignorar</SelectItem>
											<SelectItem value="skip">Pular</SelectItem>
										</SelectContent>
									</Select>

									{state.action === "create" && (
										<>
											<Select
												value={state.categoryId ?? ""}
												onValueChange={(value) =>
													setBankOnlyState((prev) => ({
														...prev,
														[row.fingerprint]: { ...state, categoryId: value || null },
													}))
												}
											>
												<SelectTrigger className="w-48">
													<SelectValue placeholder="Categoria…" />
												</SelectTrigger>
												<SelectContent>
													{categoryOptions.map((option) => (
														<SelectItem key={option.value} value={option.value}>
															<CategorySelectContent
																label={option.label}
																icon={option.icon}
															/>
														</SelectItem>
													))}
												</SelectContent>
											</Select>
											<Select
												value={state.payerId ?? defaultPayerId}
												onValueChange={(value) =>
													setBankOnlyState((prev) => ({
														...prev,
														[row.fingerprint]: { ...state, payerId: value },
													}))
												}
											>
												<SelectTrigger className="w-40">
													<SelectValue placeholder="Pessoa…" />
												</SelectTrigger>
												<SelectContent>
													{payerOptions.map((option) => (
														<SelectItem key={option.value} value={option.value}>
															<PayerSelectContent
																label={option.label}
																avatarUrl={option.avatarUrl}
															/>
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</>
									)}

									{state.action === "ignore" && (
										<Input
											className="w-56"
											placeholder="Motivo…"
											value={state.reason}
											onChange={(e) =>
												setBankOnlyState((prev) => ({
													...prev,
													[row.fingerprint]: { ...state, reason: e.target.value },
												}))
											}
										/>
									)}
								</div>
							</div>
						</RowCard>
					);
				})}
				{bankOnlyRows.length === 0 && <EmptyBucket />}
			</BucketSection>

			<BucketSection title={`Só no app (${appOnlyTransactions.length})`}>
				{appOnlyTransactions.map((tx) => (
					<RowCard key={tx.id}>
						<div className="flex flex-col">
							<span className="font-medium">{tx.name}</span>
							<span className="text-muted-foreground text-xs">
								{formatDate(tx.date)} ·{" "}
								{formatCurrency(signedAmount(tx.amount, tx.transactionType))}
							</span>
						</div>
					</RowCard>
				))}
				{appOnlyTransactions.length === 0 && <EmptyBucket />}
			</BucketSection>

			<BucketSection title={`Ambíguas (${ambiguousRows.length})`}>
				{ambiguousRows.map((row) => {
					if (row.status !== "ambiguous") return null;
					const state = getAmbiguous(row.fingerprint);
					return (
						<RowCard key={row.fingerprint}>
							<div className="flex flex-col gap-2">
								<div className="flex flex-col">
									<span className="font-medium">{row.row.description}</span>
									<span className="text-muted-foreground text-xs">
										{formatDate(row.row.date)} ·{" "}
										{formatCurrency(signedAmount(row.row.amount, row.row.transactionType))}
										{" · "}
										{row.candidateIds.length} candidatos
									</span>
								</div>
								<div className="flex flex-wrap items-center gap-2">
									<Select
										value={
											state.action === "confirm" && state.transactionId
												? state.transactionId
												: state.action
										}
										onValueChange={(value) => {
											if (value === "create" || value === "ignore" || value === "skip") {
												setAmbiguousState((prev) => ({
													...prev,
													[row.fingerprint]: {
														...state,
														action: value,
														transactionId: null,
													},
												}));
												return;
											}
											setAmbiguousState((prev) => ({
												...prev,
												[row.fingerprint]: {
													...state,
													action: "confirm",
													transactionId: value,
												},
											}));
										}}
									>
										<SelectTrigger className="w-56">
											<SelectValue placeholder="Escolher candidato…" />
										</SelectTrigger>
										<SelectContent>
											{row.candidateIds.map((candidateId) => {
												const candidate = appTransactionsById.get(candidateId);
												return (
													<SelectItem key={candidateId} value={candidateId}>
														{candidate
															? `${candidate.name} · ${formatDate(candidate.date)} · ${formatCurrency(
																	signedAmount(candidate.amount, candidate.transactionType),
																)}`
															: candidateId}
													</SelectItem>
												);
											})}
											<SelectItem value="create">Criar lançamento novo</SelectItem>
											<SelectItem value="ignore">Ignorar</SelectItem>
											<SelectItem value="skip">Pular</SelectItem>
										</SelectContent>
									</Select>

									{state.action === "ignore" && (
										<Input
											className="w-56"
											placeholder="Motivo…"
											value={state.reason}
											onChange={(e) =>
												setAmbiguousState((prev) => ({
													...prev,
													[row.fingerprint]: { ...state, reason: e.target.value },
												}))
											}
										/>
									)}
								</div>
							</div>
						</RowCard>
					);
				})}
				{ambiguousRows.length === 0 && <EmptyBucket />}
			</BucketSection>

			<div className="flex justify-end">
				<Button disabled={!canApply} onClick={() => onApply(decisions)}>
					{isApplying ? "Aplicando…" : "Aplicar"}
				</Button>
			</div>
		</div>
	);
}

function matchCategoryByRawLabel(
	categoryRaw: string | null | undefined,
	categoryOptions: SelectOption[],
): string | null {
	if (!categoryRaw) return null;
	const normalized = categoryRaw.trim().toLowerCase();
	return (
		categoryOptions.find((option) => option.label.trim().toLowerCase() === normalized)
			?.value ?? null
	);
}

function BucketSection({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<section className="flex flex-col gap-2">
			<h3 className="font-medium text-sm">{title}</h3>
			<div className="flex flex-col gap-2">{children}</div>
		</section>
	);
}

function RowCard({ children }: { children: React.ReactNode }) {
	return <div className="rounded-lg border p-3 text-sm">{children}</div>;
}

function EmptyBucket() {
	return <p className="text-muted-foreground text-xs">Nada aqui.</p>;
}
