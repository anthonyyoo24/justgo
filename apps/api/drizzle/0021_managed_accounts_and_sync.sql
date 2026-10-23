CREATE TABLE "justgo"."deleted_completion_ids" (
	"user_id" uuid NOT NULL,
	"attempt_id" uuid NOT NULL,
	CONSTRAINT "deleted_completion_ids_user_id_attempt_id_pk" PRIMARY KEY("user_id","attempt_id")
);
--> statement-breakpoint
ALTER TABLE "justgo"."deleted_completion_ids" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "justgo"."journal_versions" (
	"user_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"attempt_id" uuid NOT NULL,
	"parents" uuid[] NOT NULL,
	"feeling_scale_version" integer NOT NULL,
	"reflection" jsonb NOT NULL,
	CONSTRAINT "journal_versions_user_id_version_id_pk" PRIMARY KEY("user_id","version_id"),
	CONSTRAINT "journal_version_scale" CHECK ("justgo"."journal_versions"."feeling_scale_version"=1)
);
--> statement-breakpoint
ALTER TABLE "justgo"."journal_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "justgo"."managed_auth_accounts" (
	"auth_user_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "justgo"."managed_auth_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "justgo"."managed_auth_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"auth_user_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "justgo"."managed_auth_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "justgo"."users" ADD COLUMN "data_epoch" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "justgo"."users" ADD COLUMN "data_deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "justgo"."deleted_completion_ids" ADD CONSTRAINT "deleted_completion_ids_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "justgo"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "justgo"."journal_versions" ADD CONSTRAINT "journal_versions_user_id_attempt_id_attempts_user_id_id_fk" FOREIGN KEY ("user_id","attempt_id") REFERENCES "justgo"."attempts"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "justgo"."managed_auth_accounts" ADD CONSTRAINT "managed_auth_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "justgo"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "justgo"."managed_auth_sessions" ADD CONSTRAINT "managed_auth_sessions_auth_user_id_managed_auth_accounts_auth_user_id_fk" FOREIGN KEY ("auth_user_id") REFERENCES "justgo"."managed_auth_accounts"("auth_user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "justgo"."managed_auth_sessions" ADD CONSTRAINT "managed_auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "justgo"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "journal_versions_attempt_idx" ON "justgo"."journal_versions" USING btree ("user_id","attempt_id");--> statement-breakpoint
CREATE UNIQUE INDEX "managed_auth_owner_uq" ON "justgo"."managed_auth_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "managed_sessions_owner_idx" ON "justgo"."managed_auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE POLICY "migration_maintenance" ON "justgo"."deleted_completion_ids" AS PERMISSIVE FOR ALL TO "justgo_migrator" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "owner_access" ON "justgo"."deleted_completion_ids" AS PERMISSIVE FOR ALL TO "justgo_runtime" USING (user_id = (select justgo.current_user_id())) WITH CHECK (user_id = (select justgo.current_user_id()));--> statement-breakpoint
CREATE POLICY "migration_maintenance" ON "justgo"."journal_versions" AS PERMISSIVE FOR ALL TO "justgo_migrator" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "owner_access" ON "justgo"."journal_versions" AS PERMISSIVE FOR ALL TO "justgo_runtime" USING (user_id = (select justgo.current_user_id())) WITH CHECK (user_id = (select justgo.current_user_id()));--> statement-breakpoint
CREATE POLICY "migration_maintenance" ON "justgo"."managed_auth_accounts" AS PERMISSIVE FOR ALL TO "justgo_migrator" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "verified_subject_access" ON "justgo"."managed_auth_accounts" AS PERMISSIVE FOR ALL TO "justgo_runtime" USING (auth_user_id = nullif(current_setting('app.auth_user_id',true),'')::uuid) WITH CHECK (auth_user_id = nullif(current_setting('app.auth_user_id',true),'')::uuid and user_id = (select justgo.current_user_id()));--> statement-breakpoint
CREATE POLICY "migration_maintenance" ON "justgo"."managed_auth_sessions" AS PERMISSIVE FOR ALL TO "justgo_migrator" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "owner_access" ON "justgo"."managed_auth_sessions" AS PERMISSIVE FOR ALL TO "justgo_runtime" USING (user_id = (select justgo.current_user_id())) WITH CHECK (user_id = (select justgo.current_user_id()));--> statement-breakpoint
ALTER POLICY "catalog_read" ON "justgo"."challenges" TO justgo_runtime USING ((select justgo.current_user_id()) is not null or current_setting('app.guest_catalog',true) = 'on');--> statement-breakpoint
ALTER POLICY "catalog_read" ON "justgo"."levels" TO justgo_runtime USING ((select justgo.current_user_id()) is not null or current_setting('app.guest_catalog',true) = 'on');--> statement-breakpoint
ALTER POLICY "catalog_read" ON "justgo"."venue_cards" TO justgo_runtime USING ((select justgo.current_user_id()) is not null or current_setting('app.guest_catalog',true) = 'on');--> statement-breakpoint
ALTER POLICY "catalog_read" ON "justgo"."venues" TO justgo_runtime USING ((select justgo.current_user_id()) is not null or current_setting('app.guest_catalog',true) = 'on');
--> statement-breakpoint
ALTER TABLE justgo.deleted_completion_ids FORCE ROW LEVEL SECURITY;
ALTER TABLE justgo.journal_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE justgo.managed_auth_accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE justgo.managed_auth_sessions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON justgo.deleted_completion_ids,justgo.journal_versions,justgo.managed_auth_accounts,justgo.managed_auth_sessions FROM PUBLIC;
GRANT SELECT,INSERT ON justgo.deleted_completion_ids,justgo.managed_auth_accounts TO justgo_runtime;
GRANT SELECT,INSERT,DELETE ON justgo.journal_versions TO justgo_runtime;
GRANT SELECT,INSERT,UPDATE ON justgo.managed_auth_sessions TO justgo_runtime;
-- Completion grants from 0019 remain restricted to completion columns.
-- Supabase's Auth owner separately grants USAGE ON SCHEMA auth and
-- SELECT(id,user_id,not_after) ON auth.sessions to justgo_runtime before enabling
-- managed Auth. No Auth table ownership, write or Data API grant is introduced.
