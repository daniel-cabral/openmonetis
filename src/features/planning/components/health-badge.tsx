import type { PlanHealth } from "@/features/planning/lib/engine";
import { Badge } from "@/shared/components/ui/badge";

export function HealthBadge({ health }: { health: PlanHealth }) {
	if (health === "on-track") {
		return <Badge variant="success">Em dia</Badge>;
	}

	if (health === "at-risk") {
		return (
			<Badge variant="outline" className="border-warning text-warning">
				Em risco
			</Badge>
		);
	}

	return <Badge variant="destructive">Fora do eixo</Badge>;
}
