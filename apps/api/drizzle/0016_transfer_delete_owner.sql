-- Transfer-code access must never permit deleting cancellation tombstones.
-- Repair forward: account-deletion migration 0014 has already been applied.
CREATE POLICY "owner_delete_only" ON "justgo"."device_transfers" AS RESTRICTIVE FOR DELETE TO "justgo_runtime" USING (user_id = (select justgo.current_user_id()));
