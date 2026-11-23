import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "./cipher";
import { AiCredentialKeyError } from "./errors";

describe("secret cipher", () => {
	it("round-trips with the same secret and fails with another", () => {
		const encrypted = encryptSecret({ apiKey: "sk-x" }, "a");

		expect(decryptSecret(encrypted, "a")).toEqual({ apiKey: "sk-x" });
		expect(encryptSecret({ apiKey: "sk-x" }, "a")).not.toBe(encrypted);
		expect(() => decryptSecret(encrypted, "b")).toThrow(AiCredentialKeyError);
		expect(() => encryptSecret({}, "")).toThrow(AiCredentialKeyError);
	});
});
