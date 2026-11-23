import { Badge } from "@/shared/components/ui/badge";
import type { AiCredentialStatus } from "@/shared/lib/ai/credentials/store";

export type AiUiStatus =
	| "none"
	| "pending"
	| "connected"
	| "expired"
	| "invalid";

export function toUiStatus(
	credential?: AiCredentialStatus,
): Exclude<AiUiStatus, "pending"> {
	if (!credential) return "none";
	if (credential.status === "needs_reconnect") return "expired";
	if (credential.status === "invalid_secret") return "invalid";
	return "connected";
}

export function ProviderStatusBadge({ status }: { status: AiUiStatus }) {
	if (status === "connected") return <Badge variant="success">Conectado</Badge>;
	if (status === "pending") return <Badge variant="info">Aguardando</Badge>;
	if (status === "expired")
		return <Badge variant="destructive">Sessão expirada</Badge>;
	if (status === "invalid")
		return <Badge variant="destructive">Credencial inválida</Badge>;
	return <Badge variant="outline">Não configurado</Badge>;
}
