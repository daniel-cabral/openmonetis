import {
	createCipheriv,
	createDecipheriv,
	hkdfSync,
	randomBytes,
} from "node:crypto";
import { AiCredentialKeyError } from "./errors";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const HKDF_SALT = "openmonetis";
const HKDF_INFO = "openmonetis:ai-credentials:v1";

function deriveKey(secret: string | undefined): Buffer {
	if (!secret) {
		throw new AiCredentialKeyError();
	}
	return Buffer.from(hkdfSync("sha256", secret, HKDF_SALT, HKDF_INFO, 32));
}

export function encryptSecret(
	payload: object,
	secret: string | undefined = process.env.BETTER_AUTH_SECRET,
): string {
	const key = deriveKey(secret);
	const iv = randomBytes(IV_LENGTH);
	const cipher = createCipheriv(ALGORITHM, key, iv);
	const ciphertext = Buffer.concat([
		cipher.update(JSON.stringify(payload), "utf8"),
		cipher.final(),
	]);
	return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString(
		"base64",
	);
}

export function decryptSecret<T>(
	encoded: string,
	secret: string | undefined = process.env.BETTER_AUTH_SECRET,
): T {
	const key = deriveKey(secret);
	try {
		const buffer = Buffer.from(encoded, "base64");
		const iv = buffer.subarray(0, IV_LENGTH);
		const tag = buffer.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
		const ciphertext = buffer.subarray(IV_LENGTH + TAG_LENGTH);
		const decipher = createDecipheriv(ALGORITHM, key, iv);
		decipher.setAuthTag(tag);
		const plaintext = Buffer.concat([
			decipher.update(ciphertext),
			decipher.final(),
		]);
		return JSON.parse(plaintext.toString("utf8")) as T;
	} catch {
		throw new AiCredentialKeyError();
	}
}
