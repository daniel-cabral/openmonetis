export function isUnreconciledSettled(
	tx: {
		isSettled: boolean | null;
		purchaseDate: string;
		ofxImportFingerprint: string | null;
	},
	firstReconciledDate: string | null,
): boolean {
	if (!tx.isSettled || tx.ofxImportFingerprint) return false;
	if (!firstReconciledDate) return false;

	return tx.purchaseDate >= firstReconciledDate;
}
