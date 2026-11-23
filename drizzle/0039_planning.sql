CREATE TABLE "planejamento_premissas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"tipo" text NOT NULL,
	"resumo" text NOT NULL,
	"origem" text NOT NULL,
	"proposta_id" text,
	"revisar_em" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "planejamento_lances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"plano_id" uuid NOT NULL,
	"mes" text NOT NULL,
	"pct_vencedor" numeric(5, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "planejamento_posicoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"conta_id" uuid NOT NULL,
	"descricao" text NOT NULL,
	"valor" numeric(12, 2) NOT NULL,
	"liquidez" text NOT NULL,
	"mes_vencimento" text,
	"retorno_real_anual" numeric(5, 2),
	"data_referencia" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "planejamento_categorias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"plano_id" uuid NOT NULL,
	"categoria_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "planejamento_eventos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"plano_id" uuid NOT NULL,
	"descricao" text NOT NULL,
	"direcao" text NOT NULL,
	"base_valor" text NOT NULL,
	"valor_min" numeric(12, 2) NOT NULL,
	"valor" numeric(12, 2) NOT NULL,
	"valor_max" numeric(12, 2) NOT NULL,
	"mes_inicio" text NOT NULL,
	"mes_fim" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "planejamento_conversas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"titulo" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "planejamento_mensagens" (
	"id" text PRIMARY KEY NOT NULL,
	"conversa_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"papel" text NOT NULL,
	"partes" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "planejamento_ajustes" (
	"user_id" text PRIMARY KEY NOT NULL,
	"aporte_planejado" numeric(12, 2) DEFAULT '0' NOT NULL,
	"meses_reserva" smallint DEFAULT 3 NOT NULL,
	"meses_base" smallint DEFAULT 6 NOT NULL,
	"previsao_ipca" numeric(5, 2) DEFAULT '4.00' NOT NULL,
	"previsao_incc" numeric(5, 2) DEFAULT '5.00' NOT NULL,
	"horizonte_fim" text,
	"estresse_teto_aporte" numeric(12, 2),
	"estresse_meses_sem_renda" smallint DEFAULT 3 NOT NULL,
	"estresse_custo_planos" numeric(5, 2) DEFAULT '10.00' NOT NULL,
	"modelo_planejador" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "planejamento_planos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"nome" text NOT NULL,
	"tipo" text NOT NULL,
	"prioridade" integer NOT NULL,
	"inegociavel" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"base_valor" text NOT NULL,
	"indice" text NOT NULL,
	"mes_alvo" text NOT NULL,
	"janela_inicio" text,
	"janela_fim" text,
	"contas_pote" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"valor_min" numeric(12, 2),
	"valor_alvo" numeric(12, 2),
	"valor_max" numeric(12, 2),
	"valor_carta" numeric(12, 2),
	"saldo_devedor" numeric(12, 2),
	"base_lance" text,
	"margem_lance" numeric(5, 2),
	"lance_embutido" boolean DEFAULT false NOT NULL,
	"pct_lance_embutido" numeric(5, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contas" ADD COLUMN "pote_reservado" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "planejamento_premissas" ADD CONSTRAINT "planejamento_premissas_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planejamento_lances" ADD CONSTRAINT "planejamento_lances_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planejamento_lances" ADD CONSTRAINT "planejamento_lances_plano_id_planejamento_planos_id_fk" FOREIGN KEY ("plano_id") REFERENCES "public"."planejamento_planos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planejamento_posicoes" ADD CONSTRAINT "planejamento_posicoes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planejamento_posicoes" ADD CONSTRAINT "planejamento_posicoes_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planejamento_categorias" ADD CONSTRAINT "planejamento_categorias_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planejamento_categorias" ADD CONSTRAINT "planejamento_categorias_plano_id_planejamento_planos_id_fk" FOREIGN KEY ("plano_id") REFERENCES "public"."planejamento_planos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planejamento_categorias" ADD CONSTRAINT "planejamento_categorias_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planejamento_eventos" ADD CONSTRAINT "planejamento_eventos_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planejamento_eventos" ADD CONSTRAINT "planejamento_eventos_plano_id_planejamento_planos_id_fk" FOREIGN KEY ("plano_id") REFERENCES "public"."planejamento_planos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planejamento_conversas" ADD CONSTRAINT "planejamento_conversas_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planejamento_mensagens" ADD CONSTRAINT "planejamento_mensagens_conversa_id_planejamento_conversas_id_fk" FOREIGN KEY ("conversa_id") REFERENCES "public"."planejamento_conversas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planejamento_mensagens" ADD CONSTRAINT "planejamento_mensagens_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planejamento_ajustes" ADD CONSTRAINT "planejamento_ajustes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planejamento_planos" ADD CONSTRAINT "planejamento_planos_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "planejamento_premissas_user_created_at_idx" ON "planejamento_premissas" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "planejamento_premissas_user_proposta_unique" ON "planejamento_premissas" USING btree ("user_id","proposta_id");--> statement-breakpoint
CREATE UNIQUE INDEX "planejamento_lances_plano_mes_unique" ON "planejamento_lances" USING btree ("plano_id","mes");--> statement-breakpoint
CREATE INDEX "planejamento_posicoes_user_conta_ref_idx" ON "planejamento_posicoes" USING btree ("user_id","conta_id","data_referencia");--> statement-breakpoint
CREATE UNIQUE INDEX "planejamento_categorias_user_categoria_unique" ON "planejamento_categorias" USING btree ("user_id","categoria_id");--> statement-breakpoint
CREATE INDEX "planejamento_mensagens_conversa_created_at_idx" ON "planejamento_mensagens" USING btree ("conversa_id","created_at");--> statement-breakpoint
CREATE INDEX "planejamento_planos_user_prioridade_idx" ON "planejamento_planos" USING btree ("user_id","prioridade");