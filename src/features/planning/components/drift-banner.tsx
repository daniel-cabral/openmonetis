import { RiAlertLine } from "@remixicon/react";
import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@/shared/components/ui/alert";
import { Button } from "@/shared/components/ui/button";

export function DriftBanner({
	messages,
	onDiscuss,
}: {
	messages: string[];
	onDiscuss?: () => void;
}) {
	if (messages.length === 0) {
		return null;
	}

	return (
		<Alert>
			<RiAlertLine className="size-4" />
			<AlertTitle>Desvio do plano</AlertTitle>
			<AlertDescription>
				<ul className="list-disc pl-4">
					{messages.map((message) => (
						<li key={message}>{message}</li>
					))}
				</ul>
				{onDiscuss ? (
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="mt-2"
						onClick={onDiscuss}
					>
						Discutir com o planejador
					</Button>
				) : null}
			</AlertDescription>
		</Alert>
	);
}
