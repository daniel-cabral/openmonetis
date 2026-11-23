import { RiAlertLine } from "@remixicon/react";
import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@/shared/components/ui/alert";

export function DriftBanner({ messages }: { messages: string[] }) {
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
			</AlertDescription>
		</Alert>
	);
}
