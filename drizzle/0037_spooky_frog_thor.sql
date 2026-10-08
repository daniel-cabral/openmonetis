CREATE TABLE "viagens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"nome" text NOT NULL,
	"data_inicio" date NOT NULL,
	"data_fim" date NOT NULL,
	"anotacao" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lancamentos" ADD COLUMN "viagem_id" uuid;--> statement-breakpoint
ALTER TABLE "viagens" ADD CONSTRAINT "viagens_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "viagens_user_id_data_inicio_idx" ON "viagens" USING btree ("user_id","data_inicio");--> statement-breakpoint
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_viagem_id_viagens_id_fk" FOREIGN KEY ("viagem_id") REFERENCES "public"."viagens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lancamentos_user_id_viagem_id_idx" ON "lancamentos" USING btree ("user_id","viagem_id");