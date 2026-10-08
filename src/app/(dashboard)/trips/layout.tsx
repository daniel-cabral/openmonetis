import { RiPlaneLine } from "@remixicon/react";
import PageDescription from "@/shared/components/page-description";

export const metadata = {
	title: "Viagens",
};

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<section className="space-y-6">
			<PageDescription
				icon={<RiPlaneLine />}
				title="Viagens"
				subtitle="Quanto cada viagem custou, somando cartões e contas, mesmo quando a fatura cai no mês seguinte."
			/>
			{children}
		</section>
	);
}
