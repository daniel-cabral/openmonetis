ALTER TABLE "planejamento_planos" ADD COLUMN "parcela_mensal" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "planejamento_planos" ADD COLUMN "ultima_parcela" text;--> statement-breakpoint
ALTER TABLE "planejamento_planos" ADD COLUMN "modo_pos_lance" text;