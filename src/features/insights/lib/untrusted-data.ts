import {
	capUntrusted,
	UNTRUSTED_CLOSE,
	UNTRUSTED_OPEN,
} from "@/shared/lib/ai/untrusted";

const MAX_STRING_LENGTH = 200;

function sanitizeStrings(value: unknown): unknown {
	if (typeof value === "string") return capUntrusted(value, MAX_STRING_LENGTH);
	if (Array.isArray(value)) return value.map(sanitizeStrings);
	if (value !== null && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value).map(([key, item]) => [key, sanitizeStrings(item)]),
		);
	}
	return value;
}

/** Serializes aggregated data delimited as untrusted, capping every user-derived string. */
export function buildUntrustedDataBlock(data: unknown): string {
	return [
		UNTRUSTED_OPEN,
		JSON.stringify(sanitizeStrings(data), null, 2),
		UNTRUSTED_CLOSE,
	].join("\n");
}
