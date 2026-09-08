"use client";

import { useMemo, useState } from "react";
import {
	CategorySelectContent,
	PayerSelectContent,
} from "@/features/transactions/components/select-items";
import type { SelectOption } from "@/features/transactions/components/types";
import {
	buildConsumedTransactionIds,
	evaluateApplyBlock,
	initialRowName,
	isInvoicePaymentLine,
	linkPeriodForRow,
	listLinkCandidates,
	type ReconciliationRowDecision,
	resolveAmountUpdate,
} from "@/features/transactions/lib/reconciliation-review";
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
import type { ImportedTransaction } from "@/shared/lib/import/types";
import type {
	AppTransaction,
	DestinationKind,
	RowClassification,
} from "@/shared/lib/reconciliation/matcher";
import { formatCurrency } from "@/shared/utils/currency";
import { formatDate } from "@/shared/utils/date";

type BankOnlyAction = "create" | "link" | "ignore" | "skip";
type AmbiguousAction = "confirm" | "create" | "ignore" | "skip";

interface ReconciliationReviewProps {
	rows: RowClassification[];
	appOnlyTransactions: AppTransaction[];
	appTransactionsById: Map<string, AppTransaction>;
	learnedCategoryByFingerprint: Map<string, string>;
	nameMappings: Record<string, string>;
	destinationKind: DestinationKind | null;
	invoicePeriod: string;
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
	nameMappings,
	destinationKind,
	invoicePeriod,
	categoryOptions,
	payerOptions,
	defaultPayerId,
	isApplying,
	onApply,
}: ReconciliationReviewProps) {
	const matchedRows = rows.filter((r) => r.status === "matched");
	const bankOnlyRows = rows.filter(
		(r) => r.status === "bank-only" && !isInvoicePaymentLine(r.row),
	);
	const informationalRows = rows.filter(
		(r) => r.status === "bank-only" && isInvoicePaymentLine(r.row),
	);
	const ambiguousRows = rows.filter((r) => r.status === "ambiguous");

	const [confirmedByFingerprint, setConfirmedByFingerprint] = useState<
		Record<string, boolean>
	>({});
	const [bankOnlyState, setBankOnlyState] = useState<
		Record<
			string,
			{
				action: BankOnlyAction;
				name: string;
				transactionId: string | null;
				categoryId: string | null;
				payerId: string | null;
				reason: string;
			}
		>
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

	const getBankOnly = (
		fingerprint: string,
		descriptor: string,
		categoryRaw: string | null | undefined,
	) =>
		// O padrao e nao escrever nada: com "create" como estado inicial, um
		// clique em Aplicar sem revisar linha a linha criaria um lancamento para
		// cada linha do arquivo que nao casou.
		bankOnlyState[fingerprint] ?? {
			action: "skip" as BankOnlyAction,
			name: initialRowName(descriptor, nameMappings),
			transactionId: null,
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

	// Pool de vínculo manual: todos os candidatos trazidos do destino, filtrados
	// por período na hora de listar.
	const linkPool = useMemo(
		() => Array.from(appTransactionsById.values()),
		[appTransactionsById],
	);

	const consumedBy = useMemo(() => {
		const linkedByFingerprint: Record<string, string | null> = {};
		for (const [fingerprint, state] of Object.entries(bankOnlyState)) {
			if (state.action === "link") linkedByFingerprint[fingerprint] = state.transactionId;
		}
		for (const [fingerprint, state] of Object.entries(ambiguousState)) {
			if (state.action === "confirm") linkedByFingerprint[fingerprint] = state.transactionId;
		}
		return buildConsumedTransactionIds(rows, linkedByFingerprint);
	}, [rows, bankOnlyState, ambiguousState]);

	// O vínculo é escolha do usuário; o valor não é. Se o lançamento apontado
	// tem valor diferente do arquivo, o arquivo prevalece.
	const linkAmountUpdate = (
		candidate: AppTransaction | undefined,
		row: ImportedTransaction,
	) => {
		if (!candidate) return undefined;
		const update = resolveAmountUpdate({
			candidate,
			rowAmount: row.amount,
			rowTransactionType: row.transactionType,
		});
		return update
			? {
					amount: update.amount,
					transactionType: update.transactionType,
					isDivided: update.isDivided,
				}
			: undefined;
	};

	const decisions = (() => {
		const entries: { fingerprint: string; decision: ReconciliationRowDecision }[] = [];

		for (const row of matchedRows) {
			if (row.status !== "matched") continue;

			if (row.amountDivergence) {
				const app = appTransactionsById.get(row.transactionId);
				const update = app
					? resolveAmountUpdate({
							candidate: app,
							rowAmount: row.row.amount,
							rowTransactionType: row.row.transactionType,
						})
					: null;
				entries.push({
					fingerprint: row.fingerprint,
					decision: {
						action: "confirm",
						transactionId: row.transactionId,
						descriptor: row.row.description,
						amountUpdate: update
							? {
									amount: update.amount,
									transactionType: update.transactionType,
									isDivided: update.isDivided,
								}
							: undefined,
					},
				});
				continue;
			}

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
			const state = getBankOnly(
				row.fingerprint,
				row.row.description,
				row.row.categoryRaw,
			);
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
								name: state.name,
								categoryId: state.categoryId,
								payerId: state.payerId,
							}
						: state.action === "link" && state.transactionId
							? {
									action: "link",
									transactionId: state.transactionId,
									descriptor: row.row.description,
									name:
										appTransactionsById.get(state.transactionId)?.name ??
										state.name,
									// O vínculo é manual, mas o valor não é: o arquivo manda.
									amountUpdate: linkAmountUpdate(
										appTransactionsById.get(state.transactionId),
										row.row,
									),
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

	const emptyNameCreationCount = bankOnlyRows.filter((row) => {
		const state = getBankOnly(row.fingerprint, row.row.description, row.row.categoryRaw);
		return state.action === "create" && state.name.trim() === "";
	}).length;

	const applyBlock = evaluateApplyBlock({ emptyNameCreationCount });

	const canApply =
		!isApplying &&
		!applyBlock.blocked &&
		decisions.some((entry) => entry.decision.action !== "skip");

	return (
		<div className="flex flex-col gap-6">
			<BucketSection title={`Casadas (${matchedRows.length})`}>
				{matchedRows.map((row) => {
					if (row.status !== "matched") return null;
					const app = appTransactionsById.get(row.transactionId);

					if (row.amountDivergence) {
						const isDivided = app?.isDivided ?? false;
						return (
							<RowCard key={row.fingerprint}>
								<div className="flex flex-col gap-2">
									<div className="flex flex-col">
										<span className="font-medium">{row.row.description}</span>
										<span className="text-muted-foreground text-xs">
											{formatDate(row.row.date)} · app{" "}
											{formatCurrency(
												signedAmount(
													row.amountDivergence.appAmount,
													row.row.transactionType,
												),
											)}{" "}
											→ arquivo{" "}
											{formatCurrency(
												signedAmount(
													row.amountDivergence.rowAmount,
													row.row.transactionType,
												),
											)}
										</span>
									</div>
									<div className="flex flex-wrap items-center gap-2">
										{isDivided ? (
											<span className="text-muted-foreground text-xs">
												Lançamento dividido: o valor vive rateado entre as
												partes por pagador, então ele fica como está e só a
												conciliação é gravada.
											</span>
										) : (
											<span className="text-muted-foreground text-xs">
												O valor do lançamento será alinhado ao do arquivo ao
												aplicar. O desfazer restaura o anterior.
											</span>
										)}
									</div>
								</div>
							</RowCard>
						);
					}

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
					const state = getBankOnly(
						row.fingerprint,
						row.row.description,
						row.row.categoryRaw,
					);
					const linkCandidates = listLinkCandidates({
						transactions: linkPool,
						period: linkPeriodForRow({
							date: row.row.date,
							destinationKind,
							invoicePeriod,
						}),
						consumedBy,
						fingerprint: row.fingerprint,
					});
					return (
						<RowCard key={row.fingerprint}>
							<div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:gap-6">
								<div className="flex min-w-0 flex-col xl:w-64 xl:shrink-0">
									<span className="font-medium">{row.row.description}</span>
									<span className="text-muted-foreground text-xs">
										{formatDate(row.row.date)} ·{" "}
										{formatCurrency(signedAmount(row.row.amount, row.row.transactionType))}
									</span>
								</div>
								<div className="flex flex-1 flex-wrap items-center gap-3">
									<Select
										value={state.action}
										onValueChange={(value) =>
											setBankOnlyState((prev) => ({
												...prev,
												[row.fingerprint]: { ...state, action: value as BankOnlyAction },
											}))
										}
									>
										<SelectTrigger className="w-64">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="create">Criar lançamento</SelectItem>
											<SelectItem value="link">
												Vincular a lançamento existente
											</SelectItem>
											<SelectItem value="ignore">Ignorar</SelectItem>
											<SelectItem value="skip">Pular</SelectItem>
										</SelectContent>
									</Select>

									{state.action === "create" && (
										<>
											<Input
												className="min-w-56 flex-1"
												placeholder="Nome do lançamento…"
												value={state.name}
												onChange={(e) =>
													setBankOnlyState((prev) => ({
														...prev,
														[row.fingerprint]: { ...state, name: e.target.value },
													}))
												}
											/>
											<Select
												value={state.categoryId ?? ""}
												onValueChange={(value) =>
													setBankOnlyState((prev) => ({
														...prev,
														[row.fingerprint]: { ...state, categoryId: value || null },
													}))
												}
											>
												<SelectTrigger className="w-52">
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
												<SelectTrigger className="w-52">
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

									{state.action === "link" && (
										<Select
											value={state.transactionId ?? ""}
											onValueChange={(value) =>
												setBankOnlyState((prev) => ({
													...prev,
													[row.fingerprint]: { ...state, transactionId: value },
												}))
											}
										>
											<SelectTrigger className="min-w-72 flex-1">
												<SelectValue placeholder="Escolher lançamento…" />
											</SelectTrigger>
											<SelectContent>
												{linkCandidates.map(({ transaction, consumed }) => (
													<SelectItem
														key={transaction.id}
														value={transaction.id}
														disabled={consumed}
													>
														{`${transaction.name} · ${formatDate(transaction.date)} · ${formatCurrency(
															signedAmount(
																transaction.amount,
																transaction.transactionType,
															),
														)}${consumed ? " · já usado" : ""}`}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									)}

									{state.action === "link" && linkCandidates.length === 0 && (
										<span className="text-muted-foreground text-xs">
											Nenhum lançamento neste período.
										</span>
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

			<BucketSection
				title={`Pagamento da fatura anterior (${informationalRows.length})`}
			>
				{informationalRows.map((row) => (
					<RowCard key={row.fingerprint}>
						<div className="flex flex-col">
							<span className="font-medium">{row.row.description}</span>
							<span className="text-muted-foreground text-xs">
								{formatDate(row.row.date)} ·{" "}
								{formatCurrency(signedAmount(row.row.amount, row.row.transactionType))}
								{" · "}
								já lançado na conta corrente, não vira lançamento aqui
							</span>
						</div>
					</RowCard>
				))}
				{informationalRows.length === 0 && <EmptyBucket />}
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

			<div className="flex flex-col items-end gap-1">
				{applyBlock.blocked && (
					<span className="text-destructive text-xs">{applyBlock.reason}</span>
				)}
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
