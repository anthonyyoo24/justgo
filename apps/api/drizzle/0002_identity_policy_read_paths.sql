-- One read policy per role/action. Keep pre-auth digest lookup read-only.
DROP POLICY owner_access ON justgo.recovery_credentials;
--> statement-breakpoint
DROP POLICY credential_lookup ON justgo.recovery_credentials;
--> statement-breakpoint
CREATE POLICY identity_read ON justgo.recovery_credentials FOR SELECT TO justgo_runtime USING (user_id = (select justgo.current_user_id()) OR digest = (select current_setting('app.credential_digest',true)));
--> statement-breakpoint
CREATE POLICY owner_insert ON justgo.recovery_credentials FOR INSERT TO justgo_runtime WITH CHECK (user_id = (select justgo.current_user_id()));
--> statement-breakpoint
CREATE POLICY owner_update ON justgo.recovery_credentials FOR UPDATE TO justgo_runtime USING (user_id = (select justgo.current_user_id())) WITH CHECK (user_id = (select justgo.current_user_id()));
--> statement-breakpoint
DROP POLICY owner_access ON justgo.device_sessions;
--> statement-breakpoint
DROP POLICY credential_lookup ON justgo.device_sessions;
--> statement-breakpoint
CREATE POLICY identity_read ON justgo.device_sessions FOR SELECT TO justgo_runtime USING (user_id = (select justgo.current_user_id()) OR digest = (select current_setting('app.session_digest',true)));
--> statement-breakpoint
CREATE POLICY owner_insert ON justgo.device_sessions FOR INSERT TO justgo_runtime WITH CHECK (user_id = (select justgo.current_user_id()));
--> statement-breakpoint
CREATE POLICY owner_update ON justgo.device_sessions FOR UPDATE TO justgo_runtime USING (user_id = (select justgo.current_user_id())) WITH CHECK (user_id = (select justgo.current_user_id()));
