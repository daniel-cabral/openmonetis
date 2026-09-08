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

// A versao vem do package.json em vez de ser fixada aqui: o que interessa e a
// coerencia entre os tres lugares da regra 6 do AGENTS.md, nao um numero
// especifico que obrigaria a editar este teste a cada release.
const versao = pkg.version;
const escapado = versao.replace(/\./g, "\\.");

describe(`versao ${versao}`, () => {
	it("README traz o badge da versao do package.json", () => {
		expect(readme).toMatch(new RegExp(`badge/version-${escapado}-blue`));
	});

	it("CHANGELOG tem a entrada da versao com paragrafo de prosa antes das secoes", () => {
		const match = changelog.match(
			new RegExp(`## \\[${escapado}\\][^\\n]*\\n\\n([^\\n#][^\\n]+)\\n\\n### `),
		);
		expect(match).not.toBeNull();
		expect(match?.[1]?.length ?? 0).toBeGreaterThan(40);
	});

	it("a versao do package.json segue SemVer", () => {
		expect(versao).toMatch(/^\d+\.\d+\.\d+$/);
	});
});
