"use client";

import { AccountCardSelectContent } from "@/features/transactions/components/select-items";
import type { SelectOption } from "@/features/transactions/components/types";
import { destinationKindForProfile } from "@/features/transactions/lib/reconciliation-origin";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/shared/components/ui/card";
import { Label } from "@/shared/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import type { DetectResult } from "@/shared/lib/import/parsers/detect";

interface OriginConfirmationProps {
	detectResult: DetectResult;
	profileId: string | null;
	destinationId: string | null;
	accountOptions: SelectOption[];
	cardOptions: SelectOption[];
	onProfileChange: (profileId: string) => void;
	onDestinationChange: (destinationId: string) => void;
}

export function OriginConfirmation({
	detectResult,
	profileId,
	destinationId,
	accountOptions,
	cardOptions,
	onProfileChange,
	onDestinationChange,
}: OriginConfirmationProps) {
	const selectedProfile =
		detectResult.profiles.find((p) => p.id === profileId) ?? null;
	const destinationKind = destinationKindForProfile(selectedProfile);
	const destinationOptions =
		destinationKind === "card" ? cardOptions : accountOptions;

	return (
		<Card>
			<CardHeader>
				<CardTitle>Confirme a origem do arquivo</CardTitle>
				<CardDescription>
					{detectResult.detected
						? "Perfil de banco detectado automaticamente. Confira e ajuste se necessário."
						: "Não foi possível detectar o perfil automaticamente. Selecione manualmente."}
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<div className="flex flex-col gap-1.5">
					<Label>Perfil do banco</Label>
					<Select
						value={profileId ?? ""}
						onValueChange={(value) => onProfileChange(value)}
					>
						<SelectTrigger className="w-full">
							<SelectValue placeholder="Selecionar perfil…" />
						</SelectTrigger>
						<SelectContent>
							{detectResult.profiles.map((profile) => (
								<SelectItem key={profile.id} value={profile.id}>
									{profile.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<div className="flex flex-col gap-1.5">
					<Label>
						{destinationKind === "card" ? "Cartão de destino" : "Conta de destino"}
					</Label>
					<Select
						value={destinationId ?? ""}
						onValueChange={(value) => onDestinationChange(value)}
						disabled={!destinationKind}
					>
						<SelectTrigger className="w-full">
							<SelectValue placeholder="Selecionar destino…" />
						</SelectTrigger>
						<SelectContent>
							{destinationOptions.map((option) => (
								<SelectItem key={option.value} value={option.value}>
									<AccountCardSelectContent
										label={option.label}
										logo={option.logo}
										isCartao={destinationKind === "card"}
									/>
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</CardContent>
		</Card>
	);
}
