CREATE TABLE IF NOT EXISTS "establishment_logos" (
	"user_id" text NOT NULL,
	"name_key" text NOT NULL,
	"domain" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "establishment_logos_user_id_name_key_pk" PRIMARY KEY("user_id","name_key")
);
--> statement-breakpoint
ALTER TABLE "establishment_logos" ADD CONSTRAINT "establishment_logos_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
DROP INDEX "tokens_api_user_id_idx";--> statement-breakpoint
DROP INDEX "cartoes_user_id_status_idx";--> statement-breakpoint
DROP INDEX "dashboard_notification_states_user_id_archived_idx";--> statement-breakpoint
DROP INDEX "contas_user_id_status_idx";--> statement-breakpoint
DROP INDEX "antecipacoes_parcelas_series_id_idx";--> statement-breakpoint
DROP INDEX "pagadores_user_id_status_idx";--> statement-breakpoint
DROP INDEX "pagadores_user_id_role_idx";--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "anexos_user_id_idx" ON "anexos" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "orcamentos_categoria_id_idx" ON "orcamentos" USING btree ("categoria_id");--> statement-breakpoint
CREATE INDEX "cartoes_conta_id_idx" ON "cartoes" USING btree ("conta_id");--> statement-breakpoint
CREATE INDEX "import_category_mappings_category_id_idx" ON "import_category_mappings" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "pre_lancamentos_lancamento_id_idx" ON "pre_lancamentos" USING btree ("lancamento_id");--> statement-breakpoint
CREATE INDEX "antecipacoes_parcelas_lancamento_id_idx" ON "antecipacoes_parcelas" USING btree ("lancamento_id");--> statement-breakpoint
CREATE INDEX "antecipacoes_parcelas_pagador_id_idx" ON "antecipacoes_parcelas" USING btree ("pagador_id");--> statement-breakpoint
CREATE INDEX "antecipacoes_parcelas_categoria_id_idx" ON "antecipacoes_parcelas" USING btree ("categoria_id");--> statement-breakpoint
CREATE INDEX "anotacoes_user_id_idx" ON "anotacoes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "passkey_user_id_idx" ON "passkey" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "compartilhamentos_pagador_shared_with_user_id_idx" ON "compartilhamentos_pagador" USING btree ("shared_with_user_id");--> statement-breakpoint
CREATE INDEX "compartilhamentos_pagador_created_by_user_id_idx" ON "compartilhamentos_pagador" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "lancamentos_conta_id_idx" ON "lancamentos" USING btree ("conta_id");--> statement-breakpoint
CREATE INDEX "lancamentos_categoria_id_idx" ON "lancamentos" USING btree ("categoria_id");--> statement-breakpoint
CREATE INDEX "lancamentos_antecipacao_id_idx" ON "lancamentos" USING btree ("antecipacao_id");