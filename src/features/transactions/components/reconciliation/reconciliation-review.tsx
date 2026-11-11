"use client";

import { RiAlertLine } from "@remixicon/react";
import { useMemo, useState } from "react";
import {
	type ApplyProjection,
	ReconciliationApplyBar,
} from "@/features/transactions/components/reconciliation/reconciliation-apply-bar";
import {
	CategorySelectContent,
	PayerSelectContent,
} from "@/features/transactions/components/select-items";
import { SubcategorySelect } from "@/features/transactions/components/subcategory-select";
import type { SelectOption } from "@/features/transactions/components/types";
import {
	type CategoryMapping,
	pickRememberedSubcategory,
} from "@/features/transactions/lib/import-utils";
import {
	type AccountBalanceContext,
	type PaidAfterEnd,
	projectAccountBalance,
	projectInvoiceTotal,
} from "@/features/transactions/lib/reconciliation-projection";
import {
	buildConsumedTransactionIds,
	buildReconciliationApplyPayload,
	evaluateApplyBlock,
	hasApplicableDecision,
	initialRowName,
	isCreditLine,
	isInvoicePaymentLine,
	type LinkCandidate,
	linkPeriodForRow,
	listLinkCandidates,
	type ReconciliationRowDecision,
	releaseFingerprintFor,
	resolveAmountUpdate,
} from "@/features/transactions/lib/reconciliation-review";
import { getSubcategoryOptions } from "@/features/transactions/lib/subcategory-options";
import { Badge } from "@/shared/components/ui/badge";
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
import {
	type AppTransaction,
	type DestinationKind,
	detectMatchSuspicions,
	type MatchSuspicion,
	type RowClassification,
} from "@/shared/lib/reconciliation/matcher";
import { formatCurrency } from "@/shared/utils/currency";
import { formatDate, formatDateOnly } from "@/shared/utils/date";
import { cn } from "@/shared/utils/ui";

type BankOnlyAction = "create" | "link" | "ignore" | "skip";
type AmbiguousAction = "confirm" | "create" | "ignore" | "skip";
type MatchedAction = "keep" | "create" | "link" | "skip";
type MatchedRow = Extract<RowClassification, { status: "matched" }>;

type CreateLinkFields = {
	name: string;
	transactionId: string | null;
	categoryId: string | null;
	subcategoryId: string | null;
	payerId: string | null;
};

type MatchedState = CreateLinkFields & {
	action: MatchedAction;
	expanded: boolean;
};

type ReviewProjectionTarget =
	| {
			kind: "statement";
			context: AccountBalanceContext;
			finalBalance: { day: string; balance: number } | null;
	  }
	| { kind: "invoice"; invoicePeriod: string; expectedTotal: number | null };

interface ReconciliationReviewProps {
	rows: RowClassification[];
	appOnlyTransactions: AppTransaction[];
	appTransactionsById: Map<string, AppTransaction>;
	learnedMappingByFingerprint: Map<string, CategoryMapping>;
	nameMappings: Record<string, string>;
	destinationKind: DestinationKind | null;
	fileStartDate: string;
	invoicePeriod: string;
	projectionTarget: ReviewProjectionTarget | null;
	categoryOptions: SelectOption[];
	payerOptions: SelectOption[];
	defaultPayerId: string;
	isApplying: boolean;
	onApply: (
		entries: { fingerprint: string; decision: ReconciliationRowDecision }[],
	) => void;
}

const signedAmount = (amount: number, transactionType: "income" | "expense") =>
	transactionType === "expense" ? -amount : amount;

export function ReconciliationReview({
	rows,
	appOnlyTransactions,
	appTransactionsById,
	learnedMappingByFingerprint,
	nameMappings,
	destinationKind,
	fileStartDate,
	invoicePeriod,
	projectionTarget,
	categoryOptions,
	payerOptions,
	defaultPayerId,
	isApplying,
	onApply,
}: ReconciliationReviewProps) {
	const matchedRows = rows.filter(
		(r): r is MatchedRow => r.status === "matched",
	);
	const bankOnlyRows = rows.filter(
		(r) => r.status === "bank-only" && !isInvoicePaymentLine(r.row),
	);
	const informationalRows = rows.filter(
		(r) => r.status === "bank-only" && isInvoicePaymentLine(r.row),
	);
	const ambiguousRows = rows.filter((r) => r.status === "ambiguous");

	const suspicionsByFingerprint = new Map<string, MatchSuspicion[]>();
	for (const row of matchedRows) {
		const app = appTransactionsById.get(row.transactionId);
		if (!app) continue;
		const suspicions = detectMatchSuspicions({
			row: row.row,
			rule: row.rule,
			transaction: app,
			fileStartDate,
			destinationKind,
		});
		if (suspicions.length > 0)
			suspicionsByFingerprint.set(row.fingerprint, suspicions);
	}
	const suspiciousRows = matchedRows.filter((row) =>
		suspicionsByFingerprint.has(row.fingerprint),
	);
	const regularMatchedRows = matchedRows.filter(
		(row) => !suspicionsByFingerprint.has(row.fingerprint),
	);

	const [confirmedByFingerprint, setConfirmedByFingerprint] = useState<
		Record<string, boolean>
	>({});
	const [matchedState, setMatchedState] = useState<
		Record<string, MatchedState>
	>({});
	const [bankOnlyState, setBankOnlyState] = useState<
		Record<
			string,
			{
				action: BankOnlyAction;
				name: string;
				transactionId: string | null;
				categoryId: string | null;
				subcategoryId: string | null;
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
				subcategoryId: string | null;
				payerId: string | null;
				reason: string;
			}
		>
	>({});

	const initialCreateFields = (
		fingerprint: string,
		descriptor: string,
		categoryRaw: string | null | undefined,
	): CreateLinkFields => {
		const learned = learnedMappingByFingerprint.get(fingerprint);
		const initialCategoryId =
			learned?.categoryId ??
			matchCategoryByRawLabel(categoryRaw, categoryOptions);
		return {
			name: initialRowName(descriptor, nameMappings),
			transactionId: null,
			categoryId: initialCategoryId,
			subcategoryId: pickRememberedSubcategory(learned, initialCategoryId),
			payerId: null,
		};
	};

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
			...initialCreateFields(fingerprint, descriptor, categoryRaw),
			reason: "",
		};

	// Casamento mantido e o padrao: so muda quando o usuario desfaz.
	const getMatched = (
		fingerprint: string,
		descriptor: string,
		categoryRaw: string | null | undefined,
	): MatchedState =>
		matchedState[fingerprint] ?? {
			action: "keep",
			expanded: false,
			...initialCreateFields(fingerprint, descriptor, categoryRaw),
		};

	const getAmbiguous = (
		fingerprint: string,
		descriptor: string,
		categoryRaw: string | null | undefined,
	) => {
		const { categoryId, subcategoryId } = initialCreateFields(
			fingerprint,
			descriptor,
			categoryRaw,
		);
		return (
			ambiguousState[fingerprint] ?? {
				action: "skip" as AmbiguousAction,
				transactionId: null,
				categoryId,
				subcategoryId,
				payerId: null,
				reason: "",
			}
		);
	};

	const bankOnlyStateOf = (row: (typeof bankOnlyRows)[number]) =>
		getBankOnly(row.fingerprint, row.row.description, row.row.categoryRaw);

	const hasBankOnlySkip = bankOnlyRows.some(
		(row) => bankOnlyStateOf(row).action === "skip",
	);

	const markAllBankOnlyAsCreate = () => {
		const next = { ...bankOnlyState };
		for (const row of bankOnlyRows) {
			const state = bankOnlyStateOf(row);
			if (state.action === "skip")
				next[row.fingerprint] = { ...state, action: "create" };
		}
		setBankOnlyState(next);
	};

	// Pool de vínculo manual: todos os candidatos trazidos do destino, filtrados
	// por período na hora de listar.
	const linkPool = useMemo(
		() => Array.from(appTransactionsById.values()),
		[appTransactionsById],
	);

	const consumedBy = useMemo(() => {
		const linkedByFingerprint: Record<string, string | null> = {};
		const releasedFingerprints = new Set<string>();
		for (const [fingerprint, state] of Object.entries(matchedState)) {
			if (state.action !== "keep") releasedFingerprints.add(fingerprint);
			if (state.action === "link")
				linkedByFingerprint[fingerprint] = state.transactionId;
		}
		for (const [fingerprint, state] of Object.entries(bankOnlyState)) {
			if (state.action === "link")
				linkedByFingerprint[fingerprint] = state.transactionId;
		}
		for (const [fingerprint, state] of Object.entries(ambiguousState)) {
			if (state.action === "confirm")
				linkedByFingerprint[fingerprint] = state.transactionId;
		}
		return buildConsumedTransactionIds(
			rows,
			linkedByFingerprint,
			releasedFingerprints,
		);
	}, [rows, matchedState, bankOnlyState, ambiguousState]);

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
		const entries: {
			fingerprint: string;
			decision: ReconciliationRowDecision;
		}[] = [];

		for (const row of matchedRows) {
			if (row.status !== "matched") continue;
			const state = getMatched(
				row.fingerprint,
				row.row.description,
				row.row.categoryRaw,
			);
			// Desfazer libera a impressao digital so de casamento por fingerprint;
			// nas demais regras o lancamento volta a ficar livre para outra linha.
			const releaseFingerprint = releaseFingerprintFor(
				row.rule,
				row.transactionId,
			);

			if (state.action === "create") {
				entries.push({
					fingerprint: row.fingerprint,
					decision: {
						action: "create",
						date: row.row.date,
						amount: row.row.amount,
						transactionType: row.row.transactionType,
						descriptor: row.row.description,
						name: state.name,
						categoryId: state.categoryId,
						subcategoryId: state.subcategoryId,
						payerId: state.payerId,
						isInvoiceCredit: isCreditLine(row.row),
						releaseFingerprint,
					},
				});
				continue;
			}

			if (state.action === "link" && state.transactionId) {
				const target = appTransactionsById.get(state.transactionId);
				entries.push({
					fingerprint: row.fingerprint,
					decision: {
						action: "link",
						transactionId: state.transactionId,
						descriptor: row.row.description,
						name: target?.name ?? state.name,
						amountUpdate: linkAmountUpdate(target, row.row),
						releaseFingerprint,
					},
				});
				continue;
			}

			// "Pular", ou vinculo sem lancamento escolhido: o casamento e desfeito
			// e nada novo e gravado. Libera a mesma impressao digital que o
			// conjunto de consumidos libera, para que os dois fiquem de acordo.
			if (state.action !== "keep") {
				entries.push({
					fingerprint: row.fingerprint,
					decision: { action: "skip", releaseFingerprint },
				});
				continue;
			}

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
								subcategoryId: state.subcategoryId,
								payerId: state.payerId,
								// Credito da fatura ganha nota propria, para nao entrar
								// como receita nos relatorios.
								isInvoiceCredit: isCreditLine(row.row),
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
			const state = getAmbiguous(
				row.fingerprint,
				row.row.description,
				row.row.categoryRaw,
			);
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
									subcategoryId: state.subcategoryId,
									payerId: state.payerId,
								}
							: state.action === "ignore"
								? { action: "ignore", reason: state.reason || "Não lançável" }
								: { action: "skip" },
			});
		}

		return entries;
	})();

	// Conta criacoes de qualquer origem: o servidor recusa todo nome vazio, inclusive
	// o de um casamento desfeito para "Criar lancamento novo".
	const emptyNameCreationCount = decisions.filter(
		(entry) =>
			entry.decision.action === "create" && entry.decision.name.trim() === "",
	).length;

	const applyBlock = evaluateApplyBlock({ emptyNameCreationCount });

	const canApply =
		!isApplying && !applyBlock.blocked && hasApplicableDecision(decisions);

	// Recalcula a cada decisão: o payload é o mesmo que o aplicar grava.
	const applyPayload = buildReconciliationApplyPayload(
		decisions,
		defaultPayerId,
	);
	const applyProjection = ((): {
		projection: ApplyProjection | null;
		paidAfterEnd: PaidAfterEnd[];
	} => {
		if (!projectionTarget) return { projection: null, paidAfterEnd: [] };

		if (projectionTarget.kind === "statement") {
			const { projected, paidAfterEnd } = projectAccountBalance({
				payload: applyPayload,
				context: projectionTarget.context,
				appTransactionsById,
			});
			const final = projectionTarget.finalBalance;
			return {
				projection: {
					label: "Saldo do app após aplicar",
					projected,
					targetLabel: final
						? `Saldo final do extrato (${formatDateOnly(final.day, { year: undefined, month: "2-digit" }) ?? final.day})`
						: "",
					target: final?.balance ?? null,
					unavailableText: "Saldo final do extrato indisponível",
				},
				paidAfterEnd,
			};
		}

		return {
			projection: {
				label: "Total da fatura no app após aplicar",
				projected: projectInvoiceTotal({
					payload: applyPayload,
					transactions: [...appTransactionsById.values()],
					invoicePeriod: projectionTarget.invoicePeriod,
				}),
				targetLabel: "Total informado",
				target: projectionTarget.expectedTotal,
				unavailableText: "Informe o total da fatura para comparar",
			},
			paidAfterEnd: [],
		};
	})();

	const renderMatchedRow = (row: MatchedRow) => {
		const app = appTransactionsById.get(row.transactionId);
		const state = getMatched(
			row.fingerprint,
			row.row.description,
			row.row.categoryRaw,
		);
		const suspicions = suspicionsByFingerprint.get(row.fingerprint) ?? [];
		const isSuspicious = suspicions.length > 0;
		const showDecision =
			isSuspicious || state.expanded || state.action !== "keep";
		const confirmed = confirmedByFingerprint[row.fingerprint] ?? true;
		const updateMatched = (patch: Partial<MatchedState>) =>
			setMatchedState((prev) => ({
				...prev,
				[row.fingerprint]: { ...state, ...patch },
			}));
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
		const amountText = (amount: number) =>
			formatCurrency(signedAmount(amount, row.row.transactionType));
		const ruleNote =
			app && (isSuspicious || !row.amountDivergence)
				? ` · casada por ${row.rule}`
				: "";

		return (
			<RowCard
				key={row.fingerprint}
				tone={isSuspicious ? "warning" : "default"}
			>
				<div className="flex flex-col gap-3">
					<div className="flex items-start gap-3">
						{state.action === "keep" &&
							!isSuspicious &&
							!row.amountDivergence && (
								<Checkbox
									checked={confirmed}
									onCheckedChange={(checked) =>
										setConfirmedByFingerprint((prev) => ({
											...prev,
											[row.fingerprint]: checked === true,
										}))
									}
								/>
							)}
						<div className="flex min-w-0 flex-1 flex-col gap-1">
							<div className="flex flex-wrap items-center gap-2">
								<span className="font-medium">{row.row.description}</span>
								{isSuspicious && (
									<Badge className="gap-1 bg-warning text-warning-foreground">
										<RiAlertLine className="size-3" />
										Suspeito
									</Badge>
								)}
							</div>
							<span className="text-muted-foreground text-xs">
								{row.amountDivergence
									? `${formatDate(row.row.date)} · app ${amountText(row.amountDivergence.appAmount)} → arquivo ${amountText(row.amountDivergence.rowAmount)}`
									: `${formatDate(row.row.date)} · ${amountText(row.row.amount)}`}
								{ruleNote}
							</span>
							{app &&
								suspicions.map((suspicion) => (
									<span key={suspicion.reason} className="text-xs">
										{suspicionCopy(suspicion, app)}
									</span>
								))}
						</div>
						{state.action === "keep" && !isSuspicious && !state.expanded && (
							<Button
								variant="ghost"
								size="sm"
								className="text-muted-foreground"
								onClick={() => updateMatched({ expanded: true })}
							>
								Desfazer casamento
							</Button>
						)}
					</div>

					{state.action === "keep" && !isSuspicious && row.amountDivergence && (
						<span className="text-muted-foreground text-xs">
							{app?.isDivided
								? "Lançamento dividido: o valor vive rateado entre as partes por pagador, então ele fica como está e só a conciliação é gravada."
								: "O valor do lançamento será alinhado ao do arquivo ao aplicar. O desfazer restaura o anterior."}
						</span>
					)}

					{showDecision && (
						<div className="flex flex-wrap items-center gap-3">
							<Select
								value={state.action}
								onValueChange={(value) =>
									updateMatched({ action: value as MatchedAction })
								}
							>
								<SelectTrigger className="w-64">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="keep">Manter casamento</SelectItem>
									<SelectItem value="create">Criar lançamento novo</SelectItem>
									<SelectItem value="link">
										Vincular a outro lançamento
									</SelectItem>
									<SelectItem value="skip">Pular</SelectItem>
								</SelectContent>
							</Select>
							{(state.action === "create" || state.action === "link") && (
								<CreateOrLinkFields
									action={state.action}
									state={state}
									onChange={updateMatched}
									linkCandidates={linkCandidates}
									categoryOptions={categoryOptions}
									payerOptions={payerOptions}
									defaultPayerId={defaultPayerId}
								/>
							)}
						</div>
					)}
				</div>
			</RowCard>
		);
	};

	return (
		<div className="flex flex-col gap-6">
			{suspiciousRows.length > 0 && (
				<BucketSection
					title={`Precisa da sua decisão (${suspiciousRows.length})`}
				>
					{suspiciousRows.map((row) => renderMatchedRow(row))}
				</BucketSection>
			)}

			<BucketSection title={`Casadas (${regularMatchedRows.length})`}>
				{regularMatchedRows.map((row) => renderMatchedRow(row))}
				{regularMatchedRows.length === 0 && <EmptyBucket />}
			</BucketSection>

			<BucketSection
				title={`Só no banco (${bankOnlyRows.length})`}
				action={
					<Button
						variant="outline"
						size="sm"
						disabled={!hasBankOnlySkip}
						onClick={markAllBankOnlyAsCreate}
					>
						Marcar todas como Criar
					</Button>
				}
			>
				{bankOnlyRows.map((row) => {
					const state = bankOnlyStateOf(row);
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
										{formatCurrency(
											signedAmount(row.row.amount, row.row.transactionType),
										)}
									</span>
								</div>
								<div className="flex flex-1 flex-wrap items-center gap-3">
									<Select
										value={state.action}
										onValueChange={(value) =>
											setBankOnlyState((prev) => ({
												...prev,
												[row.fingerprint]: {
													...state,
													action: value as BankOnlyAction,
												},
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

									{(state.action === "create" || state.action === "link") && (
										<CreateOrLinkFields
											action={state.action}
											state={state}
											onChange={(patch) =>
												setBankOnlyState((prev) => ({
													...prev,
													[row.fingerprint]: { ...state, ...patch },
												}))
											}
											linkCandidates={linkCandidates}
											categoryOptions={categoryOptions}
											payerOptions={payerOptions}
											defaultPayerId={defaultPayerId}
										/>
									)}

									{state.action === "ignore" && (
										<Input
											className="w-56"
											placeholder="Motivo…"
											value={state.reason}
											onChange={(e) =>
												setBankOnlyState((prev) => ({
													...prev,
													[row.fingerprint]: {
														...state,
														reason: e.target.value,
													},
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
								{formatCurrency(
									signedAmount(row.row.amount, row.row.transactionType),
								)}
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
					const state = getAmbiguous(
						row.fingerprint,
						row.row.description,
						row.row.categoryRaw,
					);
					return (
						<RowCard key={row.fingerprint}>
							<div className="flex flex-col gap-2">
								<div className="flex flex-col">
									<span className="font-medium">{row.row.description}</span>
									<span className="text-muted-foreground text-xs">
										{formatDate(row.row.date)} ·{" "}
										{formatCurrency(
											signedAmount(row.row.amount, row.row.transactionType),
										)}
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
											if (
												value === "create" ||
												value === "ignore" ||
												value === "skip"
											) {
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
																	signedAmount(
																		candidate.amount,
																		candidate.transactionType,
																	),
																)}`
															: candidateId}
													</SelectItem>
												);
											})}
											<SelectItem value="create">
												Criar lançamento novo
											</SelectItem>
											<SelectItem value="ignore">Ignorar</SelectItem>
											<SelectItem value="skip">Pular</SelectItem>
										</SelectContent>
									</Select>

									{state.action === "create" && (
										<CategoryFields
											state={state}
											categoryOptions={categoryOptions}
											onChange={(patch) =>
												setAmbiguousState((prev) => ({
													...prev,
													[row.fingerprint]: { ...state, ...patch },
												}))
											}
										/>
									)}

									{state.action === "ignore" && (
										<Input
											className="w-56"
											placeholder="Motivo…"
											value={state.reason}
											onChange={(e) =>
												setAmbiguousState((prev) => ({
													...prev,
													[row.fingerprint]: {
														...state,
														reason: e.target.value,
													},
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

			<ReconciliationApplyBar
				projection={applyProjection.projection}
				paidAfterEnd={applyProjection.paidAfterEnd}
				suspiciousCount={suspiciousRows.length}
				blockReason={applyBlock.blocked ? applyBlock.reason : null}
				canApply={canApply}
				isApplying={isApplying}
				onApply={() => onApply(decisions)}
			/>
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
		categoryOptions.find(
			(option) => option.label.trim().toLowerCase() === normalized,
		)?.value ?? null
	);
}

function BucketSection({
	title,
	action,
	children,
}: {
	title: string;
	action?: React.ReactNode;
	children: React.ReactNode;
}) {
	return (
		<section className="flex flex-col gap-2">
			<div className="flex items-center justify-between gap-2">
				<h3 className="font-medium text-sm">{title}</h3>
				{action}
			</div>
			<div className="flex flex-col gap-2">{children}</div>
		</section>
	);
}

function RowCard({
	children,
	tone = "default",
}: {
	children: React.ReactNode;
	tone?: "default" | "warning";
}) {
	return (
		<div
			className={cn(
				"rounded-lg border p-3 text-sm",
				tone === "warning" && "border-warning/60 bg-warning/5",
			)}
		>
			{children}
		</div>
	);
}

function shortDate(value: string): string {
	return (
		formatDateOnly(value, {
			day: "2-digit",
			month: "2-digit",
			year: undefined,
		}) ?? value
	);
}

function suspicionCopy(suspicion: MatchSuspicion, app: AppTransaction): string {
	if (suspicion.reason === "before-file-start") {
		return `Casou com “${app.name}” de ${shortDate(suspicion.transactionDate)}, antes do início do arquivo (${shortDate(suspicion.fileStartDate)}). O débito desse lançamento pode ter sido outro.`;
	}
	const amount = formatCurrency(suspicion.appAmount);
	if (app.isDivided) {
		return `Valor diferente: o lançamento “${app.name}” tem ${amount}. Ele é dividido, então manter grava só a conciliação, sem mexer no valor.`;
	}
	return `Valor diferente: o lançamento “${app.name}” tem ${amount}. Manter alinha o valor ao do arquivo.`;
}

function CategoryFields({
	state,
	categoryOptions,
	onChange,
}: {
	state: Pick<CreateLinkFields, "categoryId" | "subcategoryId">;
	categoryOptions: SelectOption[];
	onChange: (
		patch: Partial<Pick<CreateLinkFields, "categoryId" | "subcategoryId">>,
	) => void;
}) {
	return (
		<>
			<Select
				value={state.categoryId ?? ""}
				onValueChange={(value) =>
					onChange({ categoryId: value || null, subcategoryId: null })
				}
			>
				<SelectTrigger className="w-52">
					<SelectValue placeholder="Categoria…" />
				</SelectTrigger>
				<SelectContent>
					{categoryOptions.map((option) => (
						<SelectItem key={option.value} value={option.value}>
							<CategorySelectContent label={option.label} icon={option.icon} />
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<SubcategorySelect
				className="w-52"
				options={getSubcategoryOptions(categoryOptions, state.categoryId)}
				value={state.subcategoryId}
				onChange={(subcategoryId) => onChange({ subcategoryId })}
			/>
		</>
	);
}

function CreateOrLinkFields({
	action,
	state,
	onChange,
	linkCandidates,
	categoryOptions,
	payerOptions,
	defaultPayerId,
}: {
	action: "create" | "link";
	state: CreateLinkFields;
	onChange: (patch: Partial<CreateLinkFields>) => void;
	linkCandidates: LinkCandidate[];
	categoryOptions: SelectOption[];
	payerOptions: SelectOption[];
	defaultPayerId: string;
}) {
	if (action === "link") {
		return (
			<>
				<Select
					value={state.transactionId ?? ""}
					onValueChange={(value) => onChange({ transactionId: value })}
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
									signedAmount(transaction.amount, transaction.transactionType),
								)}${consumed ? " · já usado" : ""}`}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				{linkCandidates.length === 0 && (
					<span className="text-muted-foreground text-xs">
						Nenhum lançamento neste período.
					</span>
				)}
			</>
		);
	}

	return (
		<>
			<Input
				className="min-w-56 flex-1"
				placeholder="Nome do lançamento…"
				value={state.name}
				onChange={(e) => onChange({ name: e.target.value })}
			/>
			<CategoryFields
				state={state}
				categoryOptions={categoryOptions}
				onChange={onChange}
			/>
			<Select
				value={state.payerId ?? defaultPayerId}
				onValueChange={(value) => onChange({ payerId: value })}
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
	);
}

function EmptyBucket() {
	return <p className="text-muted-foreground text-xs">Nada aqui.</p>;
}
