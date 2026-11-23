CREATE TABLE "ia_credenciais" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"provedor" text NOT NULL,
	"status" text NOT NULL,
	"segredo_criptografado" text NOT NULL,
	"mascara_segredo" text,
	"url_base" text,
	"conta_externa_id" text,
	"conta_externa_email" text,
	"tipo_plano" text,
	"acesso_expira_em" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"renovado_em" timestamp with time zone,
	CONSTRAINT "ia_credenciais_provedor_check" CHECK ("ia_credenciais"."provedor" in ('chatgpt', 'openai', 'anthropic', 'google', 'minimax', 'openrouter', 'ollama')),
	CONSTRAINT "ia_credenciais_status_check" CHECK ("ia_credenciais"."status" in ('connected', 'needs_reconnect', 'invalid_secret'))
);
--> statement-breakpoint
CREATE TABLE "ia_conexoes_pendentes" (
	"user_id" text PRIMARY KEY NOT NULL,
	"device_auth_id" text NOT NULL,
	"codigo_usuario" text NOT NULL,
	"url_verificacao" text NOT NULL,
	"intervalo_consulta_segundos" integer NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ia_credenciais" ADD CONSTRAINT "ia_credenciais_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ia_conexoes_pendentes" ADD CONSTRAINT "ia_conexoes_pendentes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ia_credenciais_user_provider_idx" ON "ia_credenciais" USING btree ("user_id","provedor");