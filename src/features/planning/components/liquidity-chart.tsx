"use client";

import {
	Area,
	CartesianGrid,
	ComposedChart,
	Line,
	XAxis,
	YAxis,
} from "recharts";
import { formatCents } from "@/features/planning/lib/cents";
import type { ChartPoint } from "@/features/planning/lib/view-model";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/shared/components/ui/card";
import {
	type ChartConfig,
	ChartContainer,
	ChartLegend,
	ChartLegendContent,
	ChartTooltip,
	ChartTooltipContent,
} from "@/shared/components/ui/chart";
import { formatCurrencyCompact } from "@/shared/utils/currency";

const chartConfig = {
	base: {
		label: "Liquidez base",
		color: "var(--primary)",
	},
	pessimistic: {
		label: "Pessimista",
		color: "var(--muted-foreground)",
	},
	required: {
		label: "Necessário",
		color: "var(--destructive)",
	},
} satisfies ChartConfig;

export function LiquidityChart({
	points,
	previewLabel,
}: {
	points: ChartPoint[];
	previewLabel?: string;
}) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Liquidez projetada</CardTitle>
				{previewLabel ? <CardDescription>{previewLabel}</CardDescription> : null}
			</CardHeader>
			<CardContent>
				<ChartContainer
					config={chartConfig}
					className="h-[280px] w-full aspect-auto"
				>
					<ComposedChart
						data={points}
						margin={{ top: 10, right: 10, left: 10, bottom: 5 }}
						accessibilityLayer
					>
						<CartesianGrid strokeDasharray="3 3" vertical={false} />
						<XAxis
							dataKey="label"
							tickLine={false}
							axisLine={false}
							tickMargin={8}
						/>
						<YAxis
							tickFormatter={(value: number) =>
								formatCurrencyCompact(value / 100)
							}
							tickLine={false}
							axisLine={false}
							width={80}
						/>
						<ChartTooltip
							content={
								<ChartTooltipContent
									formatter={(value) => formatCents(Number(value))}
								/>
							}
						/>
						<ChartLegend content={<ChartLegendContent />} />
						<Area
							dataKey="base"
							stroke={chartConfig.base.color}
							fill={chartConfig.base.color}
							fillOpacity={0.15}
							strokeWidth={2}
						/>
						<Line
							dataKey="pessimistic"
							stroke={chartConfig.pessimistic.color}
							strokeDasharray="4 4"
							dot={false}
						/>
						<Line
							dataKey="required"
							type="stepAfter"
							stroke={chartConfig.required.color}
							dot={false}
						/>
					</ComposedChart>
				</ChartContainer>
			</CardContent>
		</Card>
	);
}
