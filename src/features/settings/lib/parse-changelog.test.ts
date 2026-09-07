import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import pkg from "../../../../package.json";

const changelogPath = path.join(process.cwd(), "CHANGELOG.md");
const changelog = fs.readFileSync(changelogPath, "utf-8");
const readme = fs.readFileSync(path.join(process.cwd(), "README.md"), "utf-8");

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
