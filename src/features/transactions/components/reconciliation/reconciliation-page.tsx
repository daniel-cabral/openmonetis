"use client";

import { useState } from "react";
import { OriginConfirmation } from "@/features/transactions/components/reconciliation/origin-confirmation";
import { ReconciliationUploadZone } from "@/features/transactions/components/reconciliation/upload-zone";
import type { SelectOption } from "@/features/transactions/components/types";
import { resolveDefaultProfileId } from "@/features/transactions/lib/reconciliation-origin";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/shared/components/ui/card";
import { type DetectResult, detectParserProfile } from "@/shared/lib/import/parsers/detect";

interface ReconciliationPageProps {
	accountOptions: SelectOption[];
	cardOptions: SelectOption[];
}

export function ReconciliationPage({
	accountOptions,
	cardOptions,
}: ReconciliationPageProps) {
	const [fileContent, setFileContent] = useState<string | null>(null);
	const [detectResult, setDetectResult] = useState<DetectResult | null>(null);
	const [profileId, setProfileId] = useState<string | null>(null);
	const [destinationId, setDestinationId] = useState<string | null>(null);

	const handleFileRead = (content: string) => {
		const result = detectParserProfile(content);
		setFileContent(content);
		setDetectResult(result);
		setProfileId(resolveDefaultProfileId(result));
		setDestinationId(null);
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
				<OriginConfirmation
					detectResult={detectResult}
					profileId={profileId}
					destinationId={destinationId}
					accountOptions={accountOptions}
					cardOptions={cardOptions}
					onProfileChange={setProfileId}
					onDestinationChange={setDestinationId}
				/>
			) : null}
		</div>
	);
}
