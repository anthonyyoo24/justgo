CREATE TABLE "justgo"."managed_auth_deletions" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"auth_user_id" uuid NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "justgo"."managed_auth_deletions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "justgo"."managed_auth_deletions" ADD CONSTRAINT "managed_auth_deletions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "justgo"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "migration_maintenance" ON "justgo"."managed_auth_deletions" AS PERMISSIVE FOR ALL TO "justgo_migrator" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "owner_access" ON "justgo"."managed_auth_deletions" AS PERMISSIVE FOR ALL TO "justgo_runtime" USING (user_id = (select justgo.current_user_id())) WITH CHECK (user_id = (select justgo.current_user_id()));
--> statement-breakpoint
ALTER TABLE justgo.managed_auth_deletions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON justgo.managed_auth_deletions FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON justgo.managed_auth_deletions TO justgo_runtime;
