CREATE TABLE "reconciliation_ignores" (
	"user_id" text NOT NULL,
	"fingerprint" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reconciliation_ignores_user_id_fingerprint_pk" PRIMARY KEY("user_id","fingerprint")
);
--> statement-breakpoint
ALTER TABLE "reconciliation_ignores" ADD CONSTRAINT "reconciliation_ignores_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;