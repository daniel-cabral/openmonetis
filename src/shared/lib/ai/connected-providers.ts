import { listAiCredentialStatuses } from "./credentials/store";
import type { AiProviderId } from "./models";

export async function fetchConnectedAiProviders(
	userId: string,
): Promise<AiProviderId[]> {
	const statuses = await listAiCredentialStatuses(userId);
	return statuses
		.filter((credential) => credential.status === "connected")
		.map((credential) => credential.provider);
}
