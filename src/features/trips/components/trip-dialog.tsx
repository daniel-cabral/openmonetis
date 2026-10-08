"use client";

import {
	type FormEvent,
	type ReactNode,
	useEffect,
	useState,
	useTransition,
} from "react";
import { toast } from "sonner";
import { createTripAction, updateTripAction } from "@/features/trips/actions";
import {
	type TripFormTrip,
	type TripFormValues,
	toTripFormValues,
} from "@/features/trips/lib/trip-form";
import { Button } from "@/shared/components/ui/button";
import { DatePicker } from "@/shared/components/ui/date-picker";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { useControlledState } from "@/shared/hooks/use-controlled-state";

type TripDialogProps = {
	mode: "create" | "update";
	trip?: TripFormTrip;
	trigger?: ReactNode;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
};

export function TripDialog({
	mode,
	trip,
	trigger,
	open,
	onOpenChange,
}: TripDialogProps) {
	const [dialogOpen, setDialogOpen] = useControlledState(
		open,
		false,
		onOpenChange,
	);
	const [form, setForm] = useState<TripFormValues>(() =>
		toTripFormValues(trip),
	);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [isPending, startTransition] = useTransition();

	useEffect(() => {
		if (!dialogOpen) return;
		setErrorMessage(null);
		setForm(toTripFormValues(trip));
	}, [dialogOpen, trip]);

	const update = (key: keyof TripFormValues) => (value: string) =>
		setForm((prev) => ({ ...prev, [key]: value }));

	const handleSubmit = (event: FormEvent) => {
		event.preventDefault();
		startTransition(async () => {
			const result =
				mode === "update" && trip
					? await updateTripAction({ ...form, id: trip.id })
					: await createTripAction(form);
			if (!result.success) {
				setErrorMessage(result.error);
				toast.error(result.error);
				return;
			}
			toast.success(result.message);
			setDialogOpen(false);
		});
	};

	return (
		<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
			{trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						{mode === "update" ? "Editar viagem" : "Nova viagem"}
					</DialogTitle>
					<DialogDescription>
						Os lançamentos com data da compra no período passam a ser sugeridos
						para esta viagem.
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={handleSubmit} className="space-y-3">
					<div className="space-y-1">
						<Label htmlFor="trip-name">Nome</Label>
						<Input
							id="trip-name"
							value={form.name}
							maxLength={60}
							onChange={(event) => update("name")(event.target.value)}
							placeholder="Ex.: Lisboa"
						/>
					</div>
					<div className="grid grid-cols-2 gap-3">
						<div className="space-y-1">
							<Label htmlFor="trip-start">Início</Label>
							<DatePicker
								id="trip-start"
								value={form.startDate}
								onChange={update("startDate")}
							/>
						</div>
						<div className="space-y-1">
							<Label htmlFor="trip-end">Fim</Label>
							<DatePicker
								id="trip-end"
								value={form.endDate}
								onChange={update("endDate")}
							/>
						</div>
					</div>
					<div className="space-y-1">
						<Label htmlFor="trip-note">Anotação</Label>
						<Textarea
							id="trip-note"
							value={form.note}
							maxLength={500}
							rows={2}
							onChange={(event) => update("note")(event.target.value)}
						/>
					</div>
					{errorMessage ? (
						<p className="text-sm text-destructive">{errorMessage}</p>
					) : null}
					<DialogFooter>
						<Button type="submit" disabled={isPending}>
							{isPending ? "Salvando..." : "Salvar"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
