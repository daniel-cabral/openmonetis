CREATE TABLE "subcategorias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"categoria_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "import_category_mappings" ADD COLUMN "subcategory_id" uuid;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD COLUMN "subcategoria_id" uuid;--> statement-breakpoint
ALTER TABLE "subcategorias" ADD CONSTRAINT "subcategorias_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subcategorias" ADD CONSTRAINT "subcategorias_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subcategorias_user_id_categoria_id_idx" ON "subcategorias" USING btree ("user_id","categoria_id");--> statement-breakpoint
ALTER TABLE "import_category_mappings" ADD CONSTRAINT "import_category_mappings_subcategory_id_subcategorias_id_fk" FOREIGN KEY ("subcategory_id") REFERENCES "public"."subcategorias"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_subcategoria_id_subcategorias_id_fk" FOREIGN KEY ("subcategoria_id") REFERENCES "public"."subcategorias"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lancamentos_subcategoria_id_idx" ON "lancamentos" USING btree ("subcategoria_id");