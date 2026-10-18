CREATE TABLE "justgo"."account_acceptances" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"terms_version" text NOT NULL,
	"privacy_version" text NOT NULL,
	"analytics_scope_version" text NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "acceptance_versions" CHECK ("justgo"."account_acceptances"."terms_version" ~ '^[a-zA-Z0-9._-]{1,80}$' and "justgo"."account_acceptances"."privacy_version" ~ '^[a-zA-Z0-9._-]{1,80}$' and "justgo"."account_acceptances"."analytics_scope_version" ~ '^[a-zA-Z0-9._-]{1,80}$')
);
--> statement-breakpoint
ALTER TABLE "justgo"."account_acceptances" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "justgo"."users" ADD COLUMN "analytics_restricted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "justgo"."account_acceptances" ADD CONSTRAINT "account_acceptances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "justgo"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "migration_maintenance" ON "justgo"."account_acceptances" AS PERMISSIVE FOR ALL TO "justgo_migrator" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "owner_access" ON "justgo"."account_acceptances" AS PERMISSIVE FOR ALL TO "justgo_runtime" USING (user_id = (select justgo.current_user_id())) WITH CHECK (user_id = (select justgo.current_user_id()));
--> statement-breakpoint
ALTER TABLE "justgo"."account_acceptances" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON justgo.account_acceptances TO justgo_runtime;
