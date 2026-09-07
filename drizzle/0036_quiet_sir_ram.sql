CREATE TABLE "import_name_mappings" (
	"user_id" text NOT NULL,
	"description_key" text NOT NULL,
	"name" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "import_name_mappings_user_id_description_key_pk" PRIMARY KEY("user_id","description_key")
);
--> statement-breakpoint
ALTER TABLE "import_name_mappings" ADD CONSTRAINT "import_name_mappings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;