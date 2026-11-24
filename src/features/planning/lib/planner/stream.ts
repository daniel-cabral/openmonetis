import {
	convertToModelMessages,
	createIdGenerator,
	type LanguageModel,
	stepCountIs,
	streamText,
	type ToolSet,
	type UIMessage,
	validateUIMessages,
} from "ai";
import {
	buildProviderOptions,
	PLANNER_EFFORT,
	PLANNER_MAX_OUTPUT_TOKENS,
} from "@/shared/lib/ai/effort";
import { withWebSearchFallback } from "@/shared/lib/ai/web-search";

export const PLANNER_MAX_STEPS = 8;

export async function createPlannerResponse(args: {
	model: LanguageModel;
	modelId: string;
	system: string;
	history: UIMessage[];
	tools: ToolSet;
	onFinish: (messages: UIMessage[]) => Promise<void>;
}): Promise<Response> {
	const validated = await validateUIMessages({
		messages: args.history,
		tools: args.tools as Parameters<typeof validateUIMessages>[0]["tools"],
	});
	const result = streamText({
		model: withWebSearchFallback(args.model),
		system: args.system,
		// { tools } routes replayed tool outputs through each tool's toModelOutput
		messages: await convertToModelMessages(validated, { tools: args.tools }),
		tools: args.tools,
		stopWhen: stepCountIs(PLANNER_MAX_STEPS),
		maxOutputTokens: PLANNER_MAX_OUTPUT_TOKENS,
		providerOptions: buildProviderOptions(args.modelId, PLANNER_EFFORT),
	});
	// not awaited: onFinish still runs when the client disconnects mid-stream
	result.consumeStream();
	return result.toUIMessageStreamResponse({
		originalMessages: validated,
		generateMessageId: createIdGenerator({ prefix: "msg", size: 16 }),
		onFinish: ({ messages }) => args.onFinish(messages),
		onError: () => "Algo deu errado.",
	});
}
