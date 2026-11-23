import type { LanguageModelMiddleware } from "ai";

type WrapGenerate = NonNullable<LanguageModelMiddleware["wrapGenerate"]>;
type GenerateResult = Awaited<ReturnType<WrapGenerate>>;
type StreamResult = Awaited<
	ReturnType<Parameters<WrapGenerate>[0]["doStream"]>
>;
type StreamPart =
	StreamResult["stream"] extends ReadableStream<infer P> ? P : never;
type Content = GenerateResult["content"][number];
type TextLike = Extract<Content, { type: "text" | "reasoning" }>;
type FinishPart = Extract<StreamPart, { type: "finish" }>;

function withMetadata(
	block: TextLike,
	providerMetadata: TextLike["providerMetadata"],
): TextLike {
	return providerMetadata ? { ...block, providerMetadata } : block;
}

type ProviderErrorShape = {
	code?: unknown;
	message?: unknown;
	response?: { error?: { code?: unknown; message?: unknown } | null };
};

function streamError(error: unknown): Error {
	if (error instanceof Error) return error;
	const shape = (
		typeof error === "object" && error !== null ? error : {}
	) as ProviderErrorShape;
	const detail = shape.response?.error ?? shape;
	if (typeof detail.message === "string") {
		const code = typeof detail.code === "string" ? `${detail.code}: ` : "";
		return new Error(`Model stream failed: ${code}${detail.message}`, {
			cause: error,
		});
	}
	return new Error(
		`Model stream failed: ${JSON.stringify(error) ?? String(error)}`,
		{ cause: error },
	);
}

async function aggregateStream(
	streamResult: StreamResult,
): Promise<GenerateResult> {
	const content: Content[] = [];
	const open = new Map<string, TextLike>();
	const warnings: GenerateResult["warnings"] = [];
	let metadata: { id?: string; modelId?: string; timestamp?: Date } = {};
	let finish: FinishPart | undefined;

	const openBlock = (key: string, block: TextLike) => {
		open.set(key, block);
		content.push(block);
	};
	const appendDelta = (key: string, delta: string) => {
		const block = open.get(key);
		if (block) block.text += delta;
	};
	const closeBlock = (
		key: string,
		providerMetadata: TextLike["providerMetadata"],
	) => {
		const block = open.get(key);
		if (block && providerMetadata) block.providerMetadata = providerMetadata;
		open.delete(key);
	};

	const reader = streamResult.stream.getReader();
	for (let next = await reader.read(); !next.done; next = await reader.read()) {
		const part = next.value;
		switch (part.type) {
			case "stream-start":
				warnings.push(...part.warnings);
				break;
			case "response-metadata":
				metadata = {
					id: part.id,
					modelId: part.modelId,
					timestamp: part.timestamp,
				};
				break;
			case "text-start":
				openBlock(
					`text:${part.id}`,
					withMetadata({ type: "text", text: "" }, part.providerMetadata),
				);
				break;
			case "text-delta":
				appendDelta(`text:${part.id}`, part.delta);
				break;
			case "text-end":
				closeBlock(`text:${part.id}`, part.providerMetadata);
				break;
			case "reasoning-start":
				openBlock(
					`reasoning:${part.id}`,
					withMetadata({ type: "reasoning", text: "" }, part.providerMetadata),
				);
				break;
			case "reasoning-delta":
				appendDelta(`reasoning:${part.id}`, part.delta);
				break;
			case "reasoning-end":
				closeBlock(`reasoning:${part.id}`, part.providerMetadata);
				break;
			case "tool-input-start":
			case "tool-input-delta":
			case "tool-input-end":
			case "raw":
				break;
			case "finish":
				finish = part;
				break;
			case "error":
				throw streamError(part.error);
			default:
				content.push(part);
		}
	}

	if (!finish) throw new Error("Model stream ended without a finish part");

	return {
		content,
		finishReason: finish.finishReason,
		usage: finish.usage,
		...(finish.providerMetadata
			? { providerMetadata: finish.providerMetadata }
			: {}),
		...(streamResult.request ? { request: streamResult.request } : {}),
		response: { ...metadata, headers: streamResult.response?.headers },
		warnings,
	};
}

// The Codex backend only answers in streaming mode: generate calls run the
// stream and aggregate it back into a single result.
export const streamToGenerateMiddleware: LanguageModelMiddleware = {
	specificationVersion: "v3",
	wrapGenerate: async ({ doStream }) => aggregateStream(await doStream()),
};
