const TOOL_LABELS: Record<string, string> = {
	get_category_totals: "Consultando gastos por categoria",
	list_cut_candidates: "Buscando categorias para cortar",
	run_projection: "Consultando a projeção",
	simulate_lever: "Simulando um ajuste",
	propose_change: "Montando uma proposta",
	web_search: "Pesquisando na web",
	google_search: "Pesquisando na web",
};

export function ToolActivity({
	toolName,
	done,
}: {
	toolName: string;
	done: boolean;
}) {
	const label = TOOL_LABELS[toolName] ?? "Usando uma ferramenta";
	return (
		<span className="w-fit rounded-md bg-muted px-2 py-1 text-muted-foreground text-xs">
			{done ? label : `${label}…`}
		</span>
	);
}
