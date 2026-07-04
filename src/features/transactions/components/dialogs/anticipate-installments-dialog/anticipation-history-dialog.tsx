"use client";
import { RiCalendarCheckLine, RiLoader4Line } from "@remixicon/react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import { cancelInstallmentAnticipationAction } from "@/features/transactions/actions/anticipation";
import {
	installmentAnticipationsQueryKey,
	useInstallmentAnticipations,
} from "@/features/transactions/hooks/use-installment-anticipations";
import { ConfirmActionDialog } from "@/shared/components/confirm-action-dialog";
import { Button } from "@/shared/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/shared/components/ui/dialog";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/shared/components/ui/empty";
import { useControlledState } from "@/shared/hooks/use-controlled-state";
import { AnticipationCard } from "../../shared/anticipation-card";

interface AnticipationHistoryDialogProps {
	trigger?: React.ReactNode;
	seriesId: string;
	lancamentoName: string;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
}

export function AnticipationHistoryDialog({
	trigger,
	seriesId,
	lancamentoName,
	open,
	onOpenChange,
}: AnticipationHistoryDialogProps) {
	const queryClient = useQueryClient();
	const [dialogOpen, setDialogOpen] = useControlledState(
		open,
		false,
		onOpenChange,
	);
	const {
		data: anticipations = [],
		isLoading,
		isFetching,
		isError,
		refetch,
	} = useInstallmentAnticipations(seriesId, dialogOpen);

	useEffect(() => {
		if (dialogOpen) {
			void refetch();
		}
	}, [dialogOpen, refetch]);

	const cancelableAnticipation = anticipations.find(
		(anticipation) => anticipation.transaction?.isSettled !== true,
	);
	const anticipationCountLabel =
		anticipations.length === 1
			? "1 registro de antecipação encontrada"
			: `${anticipations.length} registros de antecipações encontradas`;

	const refreshHistory = () => {
		void queryClient.invalidateQueries({
			queryKey: installmentAnticipationsQueryKey(seriesId),
		});
	};

	const handleCancelAnticipation = async () => {
		if (!cancelableAnticipation) return;

		const result = await cancelInstallmentAnticipationAction({
			anticipationId: cancelableAnticipation.id,
		});

		if (result.success) {
			toast.success(result.message);
			refreshHistory();
			return;
		}

		toast.error(result.error || "Erro ao cancelar antecipação");
	};

	return (
		<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
			{trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
			<DialogContent className="min-w-0 overflow-x-hidden">
				<DialogHeader className="text-left">
					<DialogTitle>Histórico de Antecipações</DialogTitle>
					<DialogDescription>{lancamentoName}</DialogDescription>
				</DialogHeader>

				<div className="min-w-0 max-h-[60vh] overflow-x-hidden overflow-y-auto text-sm">
					{isLoading || isFetching ? (
						<LoadingState />
					) : isError ? (
						<ErrorState onRetry={() => void refetch()} />
					) : anticipations.length === 0 ? (
						<EmptyState />
					) : (
						<div className="min-w-0 space-y-3">
							<p className="text-left text-muted-foreground text-primary">
								{anticipationCountLabel}
							</p>
							{anticipations.map((anticipation) => (
								<AnticipationCard
									key={anticipation.id}
									anticipation={anticipation}
								/>
							))}
						</div>
					)}
				</div>

				<DialogFooter>
					<DialogClose asChild>
						<Button type="button" variant="outline">
							Fechar
						</Button>
					</DialogClose>
					{cancelableAnticipation ? (
						<ConfirmActionDialog
							trigger={
								<Button type="button" variant="destructive">
									Desfazer Antecipação
								</Button>
							}
							title="Cancelar antecipação?"
							description="Esta ação irá reverter a antecipação e restaurar as parcelas originais. O lançamento de antecipação será removido."
							confirmLabel="Cancelar Antecipação"
							confirmVariant="destructive"
							pendingLabel="Cancelando..."
							onConfirm={handleCancelAnticipation}
						/>
					) : null}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function LoadingState() {
	return (
		<div className="flex min-h-48 items-center justify-center rounded-lg border border-dashed">
			<RiLoader4Line className="size-6 animate-spin text-muted-foreground" />
			<span className="ml-2 text-sm text-muted-foreground">
				Carregando histórico...
			</span>
		</div>
	);
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
	return (
		<Empty>
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<RiCalendarCheckLine className="size-6 text-muted-foreground" />
				</EmptyMedia>
				<EmptyTitle>Não foi possível carregar</EmptyTitle>
				<EmptyDescription>
					O histórico de antecipações não pôde ser carregado agora.
				</EmptyDescription>
			</EmptyHeader>
			<Button
				type="button"
				variant="outline"
				className="mx-auto"
				onClick={onRetry}
			>
				Tentar novamente
			</Button>
		</Empty>
	);
}

function EmptyState() {
	return (
		<Empty>
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<RiCalendarCheckLine className="size-6 text-muted-foreground" />
				</EmptyMedia>
				<EmptyTitle>Nenhuma antecipação registrada</EmptyTitle>
				<EmptyDescription>
					As antecipações realizadas para esta compra parcelada aparecerão aqui.
				</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);
}
