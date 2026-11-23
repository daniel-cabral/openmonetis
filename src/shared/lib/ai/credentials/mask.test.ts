import { describe, expect, it } from "vitest";
import { maskApiKey } from "./mask";

describe("maskApiKey", () => {
	it.each([
		["sk-proj-abcdefghijklmnopa3F9", "sk-…a3F9"],
		["sk-ant-api03-zzzzzzzzq8Lw", "sk-ant-…q8Lw"],
		["sk-or-v1-yyyyyyyym4Tn", "sk-or-…m4Tn"],
		["AIzaSyBBBBBBBBx2Kd", "AIza…x2Kd"],
		["short123", "…23"],
	])("masks %s as %s", (key, expected) => {
		expect(maskApiKey(key)).toBe(expected);
	});
});
