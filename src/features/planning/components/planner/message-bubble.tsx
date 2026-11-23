import { getToolName, isToolUIPart, type UIMessage } from "ai";
import type { ReactNode } from "react";
import type { ProposalToolOutput } from "@/features/planning/lib/planner/tools";
import { cn } from "@/shared/utils/ui";
import { ToolActivity } from "./tool-activity";

export function MessageBubble({
	message,
	renderProposal,
}: {
	message: UIMessage;
	renderProposal?: (
		output: ProposalToolOutput,
		toolCallId: string,
	) => ReactNode;
}) {
	const isUser = message.role === "user";

	return (
		<div
			className={cn(
				"flex flex-col gap-2",
				isUser ? "items-end" : "items-start",
			)}
		>
			{message.parts.map((part, index) => {
				const key = `${message.id}-${index}`;

				if (part.type === "text") {
					if (!part.text) return null;
					return (
						<p
							key={key}
							className={cn(
								"max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm",
								isUser ? "bg-primary text-primary-foreground" : "bg-muted",
							)}
						>
							{part.text}
						</p>
					);
				}

				if (part.type === "source-url") {
					return (
						<a
							key={key}
							href={part.url}
							target="_blank"
							rel="noopener noreferrer"
							className="text-xs underline"
						>
							{part.title ?? part.url}
						</a>
					);
				}

				if (isToolUIPart(part)) {
					const toolName = getToolName(part);
					const done = part.state === "output-available";
					if (toolName === "propose_change" && done && renderProposal) {
						return (
							<div key={key} className="w-full">
								{renderProposal(
									part.output as ProposalToolOutput,
									part.toolCallId,
								)}
							</div>
						);
					}
					return <ToolActivity key={key} toolName={toolName} done={done} />;
				}

				return null;
			})}
		</div>
	);
}
