ALTER TABLE "justgo"."app_store_subscriptions" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "justgo"."managed_auth_accounts" ADD COLUMN "guest" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE POLICY "verifying_guest_read" ON "justgo"."managed_auth_accounts" AS PERMISSIVE FOR SELECT TO "justgo_runtime" USING (guest AND coalesce((select current_setting('app.original_transaction_id',true)),'') <> '');--> statement-breakpoint
CREATE POLICY "verifying_guest_lock" ON "justgo"."managed_auth_accounts" AS PERMISSIVE FOR UPDATE TO "justgo_runtime" USING (guest AND coalesce((select current_setting('app.original_transaction_id',true)),'') <> '') WITH CHECK (false);--> statement-breakpoint
ALTER POLICY "owner_or_verified_guest" ON "justgo"."app_store_subscriptions" TO justgo_runtime USING (user_id = (select justgo.current_user_id()) OR (original_transaction_id = (select current_setting('app.original_transaction_id',true)) AND EXISTS (select 1 from justgo.managed_auth_accounts m where m.user_id = app_store_subscriptions.user_id and m.guest))) WITH CHECK (user_id = (select justgo.current_user_id()));--> statement-breakpoint
-- Linking Apple or Google to a guest's Auth user clears guest, so the runtime may
-- update that one column. Billing verification also needs it to lock a guest
-- mapping with FOR SHARE, which the verifying_guest_lock policy allows and whose
-- WITH CHECK refuses any write to another account's mapping.
GRANT UPDATE (guest) ON justgo.managed_auth_accounts TO justgo_runtime;
CREATE FUNCTION justgo.reject_guest_return() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'managed_auth_accounts.guest changes only from true to false' USING ERRCODE = 'check_violation';
END;
$$;
REVOKE ALL ON FUNCTION justgo.reject_guest_return() FROM PUBLIC;
CREATE TRIGGER managed_auth_accounts_guest_ends AFTER UPDATE OF guest ON justgo.managed_auth_accounts FOR EACH ROW WHEN (NEW.guest AND NOT OLD.guest) EXECUTE FUNCTION justgo.reject_guest_return();
-- A subscription's owner changes only away from a guest account, deleted or not,
-- to the caller that verified it. The confirmed_owner_fixed trigger from 0028
-- still refuses any owner change by the webhook or the repair job.
DROP TRIGGER app_store_subscriptions_owner_fixed ON justgo.app_store_subscriptions;
CREATE FUNCTION justgo.reject_owner_change_from_account() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM justgo.managed_auth_accounts m WHERE m.user_id = OLD.user_id AND m.guest) THEN
    RAISE EXCEPTION 'app_store_subscriptions.user_id changes only away from a guest account' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION justgo.reject_owner_change_from_account() FROM PUBLIC;
CREATE TRIGGER app_store_subscriptions_owner_fixed AFTER UPDATE OF user_id ON justgo.app_store_subscriptions FOR EACH ROW WHEN (NEW.user_id IS DISTINCT FROM OLD.user_id) EXECUTE FUNCTION justgo.reject_owner_change_from_account();
