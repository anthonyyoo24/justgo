ALTER TABLE justgo.users ADD COLUMN deletion_session_digest text;
--> statement-breakpoint
CREATE UNIQUE INDEX users_deletion_session_uq ON justgo.users (deletion_session_digest);
--> statement-breakpoint
DROP POLICY owner_access ON justgo.users;
--> statement-breakpoint
CREATE POLICY owner_read ON justgo.users FOR SELECT TO justgo_runtime USING (
  id = (select justgo.current_user_id()) OR
  (deleted_at IS NOT NULL AND deletion_session_digest = (select current_setting('app.session_digest',true)))
);
--> statement-breakpoint
CREATE POLICY owner_insert ON justgo.users FOR INSERT TO justgo_runtime WITH CHECK (id = (select justgo.current_user_id()));
--> statement-breakpoint
CREATE POLICY owner_update ON justgo.users FOR UPDATE TO justgo_runtime USING (id = (select justgo.current_user_id())) WITH CHECK (id = (select justgo.current_user_id()));
--> statement-breakpoint
GRANT DELETE ON justgo.devices, justgo.device_transfers, justgo.attempts, justgo.attempt_patch_receipts TO justgo_runtime;
--> statement-breakpoint
GRANT DELETE ON justgo.device_sessions TO justgo_runtime;
--> statement-breakpoint
CREATE POLICY owner_delete ON justgo.device_sessions FOR DELETE TO justgo_runtime USING (user_id = (select justgo.current_user_id()));
