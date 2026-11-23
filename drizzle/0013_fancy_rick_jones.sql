ALTER TABLE IF EXISTS "installment_anticipations" RENAME TO "antecipacoes_parcelas";--> statement-breakpoint
ALTER TABLE IF EXISTS "pagador_shares" RENAME TO "compartilhamentos_pagador";--> statement-breakpoint
ALTER TABLE IF EXISTS "saved_insights" RENAME TO "insights_salvos";--> statement-breakpoint
ALTER TABLE IF EXISTS "inbox_items" RENAME TO "pre_lancamentos";--> statement-breakpoint
ALTER TABLE IF EXISTS "user_preferences" RENAME TO "preferencias_usuario";--> statement-breakpoint
ALTER TABLE IF EXISTS "api_tokens" RENAME TO "tokens_api";--> statement-breakpoint
ALTER TABLE "preferencias_usuario" DROP CONSTRAINT "user_preferences_user_id_unique";--> statement-breakpoint
ALTER TABLE "tokens_api" DROP CONSTRAINT "api_tokens_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "pre_lancamentos" DROP CONSTRAINT "inbox_items_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "pre_lancamentos" DROP CONSTRAINT "inbox_items_lancamento_id_lancamentos_id_fk";
--> statement-breakpoint
ALTER TABLE "antecipacoes_parcelas" DROP CONSTRAINT "installment_anticipations_lancamento_id_lancamentos_id_fk";
--> statement-breakpoint
ALTER TABLE "antecipacoes_parcelas" DROP CONSTRAINT "installment_anticipations_pagador_id_pagadores_id_fk";
--> statement-breakpoint
ALTER TABLE "antecipacoes_parcelas" DROP CONSTRAINT "installment_anticipations_categoria_id_categorias_id_fk";
--> statement-breakpoint
ALTER TABLE "antecipacoes_parcelas" DROP CONSTRAINT "installment_anticipations_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "lancamentos" DROP CONSTRAINT "lancamentos_antecipacao_id_installment_anticipations_id_fk";
--> statement-breakpoint
ALTER TABLE "compartilhamentos_pagador" DROP CONSTRAINT "pagador_shares_pagador_id_pagadores_id_fk";
--> statement-breakpoint
ALTER TABLE "compartilhamentos_pagador" DROP CONSTRAINT "pagador_shares_shared_with_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "compartilhamentos_pagador" DROP CONSTRAINT "pagador_shares_created_by_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "insights_salvos" DROP CONSTRAINT "saved_insights_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "preferencias_usuario" DROP CONSTRAINT "user_preferences_user_id_user_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "api_tokens_user_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "api_tokens_token_hash_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "inbox_items_user_id_status_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "inbox_items_user_id_created_at_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "installment_anticipations_series_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "installment_anticipations_user_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "pagador_shares_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "saved_insights_user_period_idx";--> statement-breakpoint
ALTER TABLE "tokens_api" ADD CONSTRAINT "tokens_api_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pre_lancamentos" ADD CONSTRAINT "pre_lancamentos_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pre_lancamentos" ADD CONSTRAINT "pre_lancamentos_lancamento_id_lancamentos_id_fk" FOREIGN KEY ("lancamento_id") REFERENCES "public"."lancamentos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "antecipacoes_parcelas" ADD CONSTRAINT "antecipacoes_parcelas_lancamento_id_lancamentos_id_fk" FOREIGN KEY ("lancamento_id") REFERENCES "public"."lancamentos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "antecipacoes_parcelas" ADD CONSTRAINT "antecipacoes_parcelas_pagador_id_pagadores_id_fk" FOREIGN KEY ("pagador_id") REFERENCES "public"."pagadores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "antecipacoes_parcelas" ADD CONSTRAINT "antecipacoes_parcelas_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "antecipacoes_parcelas" ADD CONSTRAINT "antecipacoes_parcelas_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_antecipacao_id_antecipacoes_parcelas_id_fk" FOREIGN KEY ("antecipacao_id") REFERENCES "public"."antecipacoes_parcelas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compartilhamentos_pagador" ADD CONSTRAINT "compartilhamentos_pagador_pagador_id_pagadores_id_fk" FOREIGN KEY ("pagador_id") REFERENCES "public"."pagadores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compartilhamentos_pagador" ADD CONSTRAINT "compartilhamentos_pagador_shared_with_user_id_user_id_fk" FOREIGN KEY ("shared_with_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compartilhamentos_pagador" ADD CONSTRAINT "compartilhamentos_pagador_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insights_salvos" ADD CONSTRAINT "insights_salvos_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preferencias_usuario" ADD CONSTRAINT "preferencias_usuario_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tokens_api_user_id_idx" ON "tokens_api" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tokens_api_token_hash_idx" ON "tokens_api" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pre_lancamentos_user_id_status_idx" ON "pre_lancamentos" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pre_lancamentos_user_id_created_at_idx" ON "pre_lancamentos" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "antecipacoes_parcelas_series_id_idx" ON "antecipacoes_parcelas" USING btree ("series_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "antecipacoes_parcelas_user_id_idx" ON "antecipacoes_parcelas" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "compartilhamentos_pagador_unique" ON "compartilhamentos_pagador" USING btree ("pagador_id","shared_with_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "insights_salvos_user_period_idx" ON "insights_salvos" USING btree ("user_id","period");--> statement-breakpoint
ALTER TABLE "preferencias_usuario" ADD CONSTRAINT "preferencias_usuario_user_id_unique" UNIQUE("user_id");