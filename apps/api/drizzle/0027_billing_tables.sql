CREATE TABLE "justgo"."app_store_subscriptions" (
	"original_transaction_id" text PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"product_id" text NOT NULL,
	"environment" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"latest_transaction_id" text NOT NULL,
	"app_account_token" uuid,
	CONSTRAINT "app_store_subscriptions_transaction_ids" CHECK ("justgo"."app_store_subscriptions"."original_transaction_id" ~ '^[0-9]{1,32}$' and "justgo"."app_store_subscriptions"."latest_transaction_id" ~ '^[0-9]{1,32}$'),
	CONSTRAINT "app_store_subscriptions_environment" CHECK ("justgo"."app_store_subscriptions"."environment" in ('Production', 'Sandbox')),
	CONSTRAINT "app_store_subscriptions_product" CHECK (char_length("justgo"."app_store_subscriptions"."product_id") between 1 and 255)
);
--> statement-breakpoint
ALTER TABLE "justgo"."app_store_subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "justgo"."billing_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_events_event_id" CHECK (char_length("justgo"."billing_events"."event_id") between 1 and 255)
);
--> statement-breakpoint
ALTER TABLE "justgo"."billing_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "justgo"."app_store_subscriptions" ADD CONSTRAINT "app_store_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "justgo"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "app_store_subscriptions_owner_idx" ON "justgo"."app_store_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE POLICY "migration_maintenance" ON "justgo"."app_store_subscriptions" AS PERMISSIVE FOR ALL TO "justgo_migrator" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "owner_or_verified_guest" ON "justgo"."app_store_subscriptions" AS PERMISSIVE FOR ALL TO "justgo_runtime" USING (user_id = (select justgo.current_user_id()) OR (user_id is null AND original_transaction_id = (select current_setting('app.original_transaction_id',true)))) WITH CHECK (user_id = (select justgo.current_user_id()) OR (user_id is null AND original_transaction_id = (select current_setting('app.original_transaction_id',true))));--> statement-breakpoint
CREATE POLICY "migration_maintenance" ON "justgo"."billing_events" AS PERMISSIVE FOR ALL TO "justgo_migrator" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "verified_event_access" ON "justgo"."billing_events" AS PERMISSIVE FOR ALL TO "justgo_runtime" USING (event_id = (select current_setting('app.billing_event_id',true))) WITH CHECK (event_id = (select current_setting('app.billing_event_id',true)));
--> statement-breakpoint
ALTER TABLE justgo.app_store_subscriptions FORCE ROW LEVEL SECURITY;
ALTER TABLE justgo.billing_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON justgo.app_store_subscriptions,justgo.billing_events FROM PUBLIC;
-- No DELETE: account deletion and delete-all keep each subscription bound to its owner.
GRANT SELECT,INSERT,UPDATE ON justgo.app_store_subscriptions TO justgo_runtime;
GRANT SELECT,INSERT ON justgo.billing_events TO justgo_runtime;
CREATE FUNCTION justgo.reject_subscription_owner_change() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'app_store_subscriptions.user_id never changes once set' USING ERRCODE = 'check_violation';
END;
$$;
REVOKE ALL ON FUNCTION justgo.reject_subscription_owner_change() FROM PUBLIC;
CREATE TRIGGER app_store_subscriptions_owner_fixed AFTER UPDATE OF user_id ON justgo.app_store_subscriptions FOR EACH ROW WHEN (OLD.user_id IS NOT NULL AND NEW.user_id IS DISTINCT FROM OLD.user_id) EXECUTE FUNCTION justgo.reject_subscription_owner_change();