import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import pkg from "../../../../package.json";

// O working copy deste repo grava CRLF; sem normalizar, os regexes abaixo
// falham dependendo de qual branch escreveu o arquivo por ultimo.
const readNormalized = (file: string) =>
	fs.readFileSync(path.join(process.cwd(), file), "utf-8").replace(/\r\n/g, "\n");

const changelog = readNormalized("CHANGELOG.md");
const readme = readNormalized("README.md");

describe("versao 2.10.0", () => {
	it("package.json aponta a versao 2.10.0", () => {
		expect(pkg.version).toBe("2.10.0");
	});

	it("README traz o badge de versao 2.10.0", () => {
		expect(readme).toMatch(/badge\/version-2\.10\.0-blue/);
	});

	it("CHANGELOG tem entrada 2.10.0 com paragrafo de prosa antes das secoes", () => {
		const match = changelog.match(
			/## \[2\.10\.0\][^\n]*\n\n([^\n#][^\n]+)\n\n### /,
		);
		expect(match).not.toBeNull();
		expect(match?.[1]?.length ?? 0).toBeGreaterThan(40);
	});
});
