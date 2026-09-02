// O descriptor do banco vem no formato "<adquirente>*<lojista>" e, quando ha
// praca, "<lojista>   <cidade>   <pais>". Preservar o segmento mais longo em
// torno do "*" mantem o identificador do lojista: "PG *FULL CYCLE" vira
// "full cycle", mas "MERCADOLIVRE*MERCADOL" vira "mercadolivre" e nao o
// fragmento truncado da direita.
function keepMerchantAroundStar(value: string): string {
	const starIndex = value.indexOf("*");
	if (starIndex < 0) return value;

	const left = value.slice(0, starIndex).trim();
	const right = value.slice(starIndex + 1).trim();
	if (!left) return right;
	if (!right) return left;
	return left.length > right.length ? left : right;
}

// Sufixo de praca: so cai quando o marcador de pais esta presente, senao um
// lojista terminado em palavra curta perderia o nome. A cidade e delimitada
// pela corrida de espacos que a separa do lojista; quando o arquivo colapsa
// esses espacos, resta descartar o ultimo token.
function stripPlaceSuffix(value: string): string {
	const withoutCountry = value.replace(/\s+(bra|br)$/, "");
	if (withoutCountry === value) return value;

	const runs = /\s{2,}/g;
	let cut = -1;
	let run = runs.exec(withoutCountry);
	while (run) {
		cut = run.index;
		run = runs.exec(withoutCountry);
	}

	if (cut >= 0) return withoutCountry.slice(0, cut);
	return withoutCountry.replace(/\s+\S+$/, "");
}

export function normalizeDescriptionKey(description: string): string {
	let key = description.toLowerCase().trim();
	// remove cidade e pais no fim (ex.: "CINE ESTRELA   DIVINOPOLIS   BRA")
	key = stripPlaceSuffix(key);
	// preserva o lado do "*" que identifica o lojista (ex.: "PG *", "DM*", "B91*")
	key = keepMerchantAroundStar(key);
	// remove codigo numerico no inicio (ex.: "223 LIV CTBA")
	key = key.replace(/^\d+\s+/, "");
	// remove sufixo numerico de loja colado (ex.: "DROGASIL2919")
	key = key.replace(/(?<=[a-z])\d+$/, "");
	// remove sufixo numerico de loja separado por espaco
	key = key.replace(/\s+\d+$/, "");
	return key.replace(/\s+/g, " ").trim();
}
