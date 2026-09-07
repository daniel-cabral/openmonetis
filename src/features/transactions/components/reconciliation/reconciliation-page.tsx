"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { fetchCategoryMappings } from "@/features/transactions/actions/category-memory-action";
import { fetchNameMappings } from "@/features/transactions/actions/name-memory-action";
import {
	applyReconciliationAction,
	undoReconciliationAction,
} from "@/features/transactions/actions/reconciliation-action";
import { fetchReconciliationCandidatesAction } from "@/features/transactions/actions/reconciliation-candidates-action";
import { OriginConfirmation } from "@/features/transactions/components/reconciliation/origin-confirmation";
import { ReconciliationReview } from "@/features/transactions/components/reconciliation/reconciliation-review";
import { ReconciliationSummary } from "@/features/transactions/components/reconciliation/reconciliation-summary";
import { ReconciliationUploadZone } from "@/features/transactions/components/reconciliation/upload-zone";
import type { SelectOption } from "@/features/transactions/components/types";
import { normalizeDescriptionKey } from "@/features/transactions/lib/import-utils";
import {
	destinationKindForProfile,
	matchAccountOptionByNumber,
} from "@/features/transactions/lib/reconciliation-origin";
import {
	buildReconciliationApplyPayload,
	deriveReconciliationClosure,
} from "@/features/transactions/lib/reconciliation-review";
import { Button } from "@/shared/components/ui/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/shared/components/ui/card";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { type DetectResult, detectParserProfile } from "@/shared/lib/import/parsers/detect";
import type { ParserProfile } from "@/shared/lib/import/parsers/registry";
import type { ImportStatement } from "@/shared/lib/import/types";
import { buildReconciliationFingerprintPayloads } from "@/shared/lib/reconciliation/fingerprint";
import {
	type AppTransaction,
	matchReconciliationRows,
	type ReconciliationMatch,
} from "@/shared/lib/reconciliation/matcher";

interface ReconciliationPageProps {
	accountOptions: SelectOption[];
	cardOptions: SelectOption[];
	payerOptions: SelectOption[];
	categoryOptions: SelectOption[];
	defaultPayerId: string | null;
}

type ReviewState = {
	statement: ImportStatement;
	fingerprints: string[];
	match: ReconciliationMatch;
	appTransactionsById: Map<string, AppTransaction>;
	learnedCategoryByFingerprint: Map<string, string>;
};

function extendedDateRange(statement: ImportStatement): { from: string; to: string } {
	const dates = statement.transactions.flatMap((t) =>
		[t.date, t.postedDate].filter((d): d is string => Boolean(d)),
	);
	const sorted = [...dates].sort();
	return {
		from: sorted[0] ?? statement.period?.from ?? statement.transactions[0]?.date ?? "",
		to:
			sorted[sorted.length - 1] ??
			statement.period?.to ??
			statement.transactions[0]?.date ??
			"",
	};
}

export function ReconciliationPage({
	accountOptions,
	cardOptions,
	payerOptions,
	categoryOptions,
	defaultPayerId,
}: ReconciliationPageProps) {
	const [isPending, startTransition] = useTransition();
	const [isApplying, startApplyTransition] = useTransition();

	const [fileContent, setFileContent] = useState<string | null>(null);
	const [detectResult, setDetectResult] = useState<DetectResult | null>(null);
	const [profileId, setProfileId] = useState<string | null>(null);
	const [destinationId, setDestinationId] = useState<string | null>(null);
	const [invoiceTotalInput, setInvoiceTotalInput] = useState("");
	const [invoicePeriodInput, setInvoicePeriodInput] = useState("");
	const [review, setReview] = useState<ReviewState | null>(null);

	const selectedProfile =
		detectResult?.profiles.find((p) => p.id === profileId) ?? null;
	const destinationKind = destinationKindForProfile(selectedProfile);

	// Só o preâmbulo é lido aqui; o parse definitivo continua depois da
	// confirmação de origem.
	const suggestDestination = (
		profile: ParserProfile | null,
		content: string | null,
	) =>
		profile && content
			? matchAccountOptionByNumber(
					profile.peekAccountNumber?.(content),
					accountOptions,
				)
			: null;

	const handleFileRead = (content: string) => {
		const result = detectParserProfile(content);
		const profile = result.detected ?? result.profiles[0] ?? null;
		setFileContent(content);
		setDetectResult(result);
		setProfileId(profile?.id ?? null);
		setDestinationId(suggestDestination(profile, content));
		setReview(null);
	};

	const buildStatementReview = async (statement: ImportStatement) => {
		if (!destinationId || !destinationKind) return;

		const destination = { type: destinationKind, id: destinationId };
		const fingerprints = buildReconciliationFingerprintPayloads({
			kind: selectedProfile?.kind === "invoice" ? "invoice" : "statement",
			source: statement.source,
			accountNumber: statement.accountNumber,
			destination,
			rows: statement.transactions,
		});

		const range = extendedDateRange(statement);
		if (!range.from || !range.to) {
			toast.error("Arquivo sem linhas para conciliar.");
			return;
		}

		const [candidates, categoryMappings, nameMappings] = await Promise.all([
			fetchReconciliationCandidatesAction({
				destination,
				from: range.from,
				to: range.to,
				fingerprints,
			}),
			fetchCategoryMappings(statement.transactions.map((t) => t.description)),
			fetchNameMappings(statement.transactions.map((t) => t.description)),
		]);

		if (!candidates.success) {
			toast.error(candidates.error);
			return;
		}

		const ignoredSet = new Set(candidates.ignoredFingerprints);
		const rows = statement.transactions.map((row, index) => ({
			fingerprint: fingerprints[index] ?? "",
			row,
		}));

		// Aprendido tem precedência sobre a categoria que o banco manda na linha.
		const learnedCategoryByFingerprint = new Map<string, string>();
		for (const { fingerprint, row } of rows) {
			const categoryId = categoryMappings[normalizeDescriptionKey(row.description)];
			if (categoryId) learnedCategoryByFingerprint.set(fingerprint, categoryId);
		}

		const match = matchReconciliationRows({
			rows,
			transactions: candidates.transactions,
			nameMappings,
			destinationKind,
		});

		// Linhas já ignoradas em conciliações anteriores não voltam a pedir decisão.
		match.rows = match.rows.filter(
			(row) => !(row.status === "bank-only" && ignoredSet.has(row.fingerprint)),
		);

		const appTransactionsById = new Map(
			candidates.transactions.map((tx) => [tx.id, tx]),
		);

		setReview({
			statement,
			fingerprints,
			match,
			appTransactionsById,
			learnedCategoryByFingerprint,
		});
	};

	// Numa fatura o período é obrigatório: a data da linha é a da compra
	// original, que pode ser de anos atrás, e não serve para derivar o período
	// do lançamento criado.
	const canAdvance =
		!!fileContent &&
		!!selectedProfile &&
		!!destinationId &&
		(destinationKind !== "card" || /^\d{4}-\d{2}$/.test(invoicePeriodInput));

	const handleAdvance = () => {
		if (!fileContent || !selectedProfile) return;

		startTransition(async () => {
			try {
				const statement = selectedProfile.parse(fileContent);
				await buildStatementReview(statement);
			} catch {
				toast.error("Não foi possível interpretar o arquivo com esse perfil.");
			}
		});
	};

	const payerId = defaultPayerId ?? payerOptions[0]?.value ?? "";

	// Derivado do que já está em memória: digitar o total da fatura depois de
	// avançar recalcula o fechamento sem refazer o upload.
	const closure = useMemo(() => {
		if (!review) return null;
		return deriveReconciliationClosure({
			profileKind: selectedProfile?.kind,
			transactions: review.statement.transactions,
			invoiceTotalInput,
		});
	}, [review, selectedProfile?.kind, invoiceTotalInput]);

	const buckets = useMemo(() => {
		if (!review) return null;
		return {
			matched: review.match.rows.filter((r) => r.status === "matched").length,
			bankOnly: review.match.rows.filter((r) => r.status === "bank-only").length,
			appOnly: review.match.appOnlyIds.length,
			ambiguous: review.match.rows.filter((r) => r.status === "ambiguous").length,
		};
	}, [review]);

	const appOnlyTransactions = useMemo(() => {
		if (!review) return [];
		return review.match.appOnlyIds
			.map((id) => review.appTransactionsById.get(id))
			.filter((tx): tx is AppTransaction => Boolean(tx));
	}, [review]);

	const handleApply = (
		entries: Parameters<typeof buildReconciliationApplyPayload>[0],
	) => {
		if (!review || !destinationId || !destinationKind || !payerId) return;

		const payload = buildReconciliationApplyPayload(entries, payerId);

		startApplyTransition(async () => {
			const result = await applyReconciliationAction({
				destination: { type: destinationKind, id: destinationId },
				paymentMethod: destinationKind === "card" ? "Cartão de crédito" : "Pix",
				invoicePeriod: destinationKind === "card" ? invoicePeriodInput : null,
				payerId,
				confirmations: payload.confirmations,
				creations: payload.creations,
				ignores: payload.ignores,
			});

			if (!result.success) {
				toast.error(result.error);
				return;
			}

			const { importBatchId, reconciled } = result;
			toast.success(
				`${result.created} criados, ${result.reconciled.length} conciliados, ${result.ignored} ignorados.`,
				{
					duration: 8000,
					action: {
						label: "Desfazer",
						onClick: async () => {
							const undo = await undoReconciliationAction({
								importBatchId,
								reconciled,
							});
							if (undo.success) toast.success("Conciliação desfeita.");
							else toast.error("Não foi possível desfazer.");
						},
					},
				},
			);

			setFileContent(null);
			setDetectResult(null);
			setProfileId(null);
			setDestinationId(null);
			setInvoiceTotalInput("");
			setInvoicePeriodInput("");
			setReview(null);
		});
	};

	return (
		<div className="flex flex-col gap-6">
			<Card>
				<CardHeader>
					<CardTitle>Conciliar extrato ou fatura</CardTitle>
				</CardHeader>
				<CardContent>
					<ReconciliationUploadZone onFileRead={handleFileRead} />
				</CardContent>
			</Card>

			{fileContent && detectResult ? (
				<>
					<OriginConfirmation
						detectResult={detectResult}
						profileId={profileId}
						destinationId={destinationId}
						accountOptions={accountOptions}
						cardOptions={cardOptions}
						onProfileChange={(id) => {
							setProfileId(id);
							setDestinationId(
								suggestDestination(
									detectResult.profiles.find((p) => p.id === id) ?? null,
									fileContent,
								),
							);
							setReview(null);
						}}
						onDestinationChange={(id) => {
							setDestinationId(id);
							setReview(null);
						}}
					/>

					{destinationKind === "card" && (
						<Card>
							<CardContent className="flex flex-wrap gap-6 pt-6">
								<div className="flex flex-col gap-1.5">
									<Label>Período da fatura</Label>
									<Input
										className="w-48"
										type="month"
										value={invoicePeriodInput}
										onChange={(e) => setInvoicePeriodInput(e.target.value)}
									/>
									<span className="text-muted-foreground text-xs">
										Os lançamentos criados entram neste período, não no mês da
										compra original.
									</span>
								</div>
								<div className="flex flex-col gap-1.5">
									<Label>Total da fatura (R$), para o fechamento aritmético</Label>
									<Input
										className="w-48"
										placeholder="0,00"
										value={invoiceTotalInput}
										onChange={(e) => setInvoiceTotalInput(e.target.value)}
									/>
								</div>
							</CardContent>
						</Card>
					)}

					{!review && (
						<div className="flex justify-end">
							<Button disabled={!canAdvance || isPending} onClick={handleAdvance}>
								{isPending ? "Processando…" : "Avançar"}
							</Button>
						</div>
					)}
				</>
			) : null}

			{review && buckets ? (
				<>
					<ReconciliationSummary buckets={buckets} closure={closure} />
					<ReconciliationReview
						rows={review.match.rows}
						appOnlyTransactions={appOnlyTransactions}
						appTransactionsById={review.appTransactionsById}
						learnedCategoryByFingerprint={review.learnedCategoryByFingerprint}
						categoryOptions={categoryOptions}
						payerOptions={payerOptions}
						defaultPayerId={payerId}
						isApplying={isApplying}
						onApply={handleApply}
					/>
				</>
			) : null}
		</div>
	);
}
