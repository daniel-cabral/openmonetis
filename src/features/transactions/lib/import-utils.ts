export function normalizeDescriptionKey(description: string): string {
	let key = description.toLowerCase().trim();
	// remove prefixo de adquirente (ex.: "PG *", "MP *", "DM*", "B91*")
	key = key.replace(/^[a-z0-9]+\s*\*\s*/, "");
	// remove codigo numerico no inicio (ex.: "223 LIV CTBA")
	key = key.replace(/^\d+\s+/, "");
	// remove sufixo numerico de loja colado (ex.: "DROGASIL2919")
	key = key.replace(/(?<=[a-z])\d+$/, "");
	// remove sufixo numerico de loja separado por espaco
	key = key.replace(/\s+\d+$/, "");
	return key.replace(/\s+/g, " ").trim();
}
