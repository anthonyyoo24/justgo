CREATE SCHEMA IF NOT EXISTS "justgo";
--> statement-breakpoint
CREATE TABLE "justgo"."recovery_credentials" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"digest" text NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "credential_kind" CHECK ("justgo"."recovery_credentials"."kind" in ('sync', 'key'))
);
--> statement-breakpoint
CREATE TABLE "justgo"."devices" (
	"id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "devices_user_id_id_pk" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "justgo"."identity_rate_buckets" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"window_start" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "justgo"."device_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"digest" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"rotated_to" uuid
);
--> statement-breakpoint
CREATE TABLE "justgo"."device_transfers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code_digest" text NOT NULL,
	"claim_digest" text NOT NULL,
	"user_id" uuid,
	"device_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"session_digest" text NOT NULL,
	"credential_digest" text NOT NULL,
	"verification" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"approved_at" timestamp with time zone,
	"redeemed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "justgo"."users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "justgo"."recovery_credentials" ADD CONSTRAINT "recovery_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "justgo"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "justgo"."devices" ADD CONSTRAINT "devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "justgo"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "justgo"."device_sessions" ADD CONSTRAINT "device_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "justgo"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "justgo"."device_sessions" ADD CONSTRAINT "device_sessions_user_id_device_id_devices_user_id_id_fk" FOREIGN KEY ("user_id","device_id") REFERENCES "justgo"."devices"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "justgo"."device_transfers" ADD CONSTRAINT "device_transfers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "justgo"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "credentials_digest_uq" ON "justgo"."recovery_credentials" USING btree ("digest");--> statement-breakpoint
CREATE INDEX "credentials_owner_idx" ON "justgo"."recovery_credentials" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "identity_rate_window_idx" ON "justgo"."identity_rate_buckets" USING btree ("window_start");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_digest_uq" ON "justgo"."device_sessions" USING btree ("digest");--> statement-breakpoint
CREATE INDEX "sessions_owner_device_idx" ON "justgo"."device_sessions" USING btree ("user_id","device_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transfers_code_uq" ON "justgo"."device_transfers" USING btree ("code_digest");--> statement-breakpoint
CREATE INDEX "transfers_owner_idx" ON "justgo"."device_transfers" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "transfers_expiry_idx" ON "justgo"."device_transfers" USING btree ("expires_at");
--> statement-breakpoint
ALTER TABLE justgo.users ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE justgo.users FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY migration_maintenance ON justgo.users TO justgo_migrator USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY owner_access ON justgo.users TO justgo_runtime USING (id = (select justgo.current_user_id())) WITH CHECK (id = (select justgo.current_user_id()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON justgo.users TO justgo_runtime;

--> statement-breakpoint
ALTER TABLE justgo.devices ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE justgo.devices FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY migration_maintenance ON justgo.devices TO justgo_migrator USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY owner_access ON justgo.devices TO justgo_runtime USING (user_id = (select justgo.current_user_id())) WITH CHECK (user_id = (select justgo.current_user_id()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON justgo.devices TO justgo_runtime;

--> statement-breakpoint
ALTER TABLE justgo.recovery_credentials ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE justgo.recovery_credentials FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY migration_maintenance ON justgo.recovery_credentials TO justgo_migrator USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY owner_access ON justgo.recovery_credentials TO justgo_runtime USING (user_id = (select justgo.current_user_id())) WITH CHECK (user_id = (select justgo.current_user_id()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON justgo.recovery_credentials TO justgo_runtime;
--> statement-breakpoint
CREATE POLICY credential_lookup ON justgo.recovery_credentials FOR SELECT TO justgo_runtime USING (digest = (select current_setting('app.credential_digest',true)));

--> statement-breakpoint
ALTER TABLE justgo.device_sessions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE justgo.device_sessions FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY migration_maintenance ON justgo.device_sessions TO justgo_migrator USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY owner_access ON justgo.device_sessions TO justgo_runtime USING (user_id = (select justgo.current_user_id())) WITH CHECK (user_id = (select justgo.current_user_id()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON justgo.device_sessions TO justgo_runtime;
--> statement-breakpoint
CREATE POLICY credential_lookup ON justgo.device_sessions FOR SELECT TO justgo_runtime USING (digest = (select current_setting('app.session_digest',true)));

--> statement-breakpoint
ALTER TABLE justgo.device_transfers ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE justgo.device_transfers FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY migration_maintenance ON justgo.device_transfers TO justgo_migrator USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY owner_access ON justgo.device_transfers TO justgo_runtime USING (user_id = (select justgo.current_user_id()) OR code_digest = (select current_setting('app.transfer_digest',true))) WITH CHECK (user_id = (select justgo.current_user_id()) OR code_digest = (select current_setting('app.transfer_digest',true)));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON justgo.device_transfers TO justgo_runtime;

--> statement-breakpoint
ALTER TABLE justgo.identity_rate_buckets ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE justgo.identity_rate_buckets FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY migration_maintenance ON justgo.identity_rate_buckets TO justgo_migrator USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY owner_access ON justgo.identity_rate_buckets TO justgo_runtime USING (key = (select current_setting('app.rate_key',true))) WITH CHECK (key = (select current_setting('app.rate_key',true)));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON justgo.identity_rate_buckets TO justgo_runtime;
