CREATE TABLE justgo.reflections (
  user_id uuid NOT NULL,
  attempt_id uuid NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  status text NOT NULL,
  feeling_version integer NOT NULL DEFAULT 1,
  feeling text,
  reflection_text text,
  input_method text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, attempt_id),
  FOREIGN KEY (user_id, attempt_id) REFERENCES justgo.attempts (user_id, id),
  CONSTRAINT reflection_revision_positive CHECK (revision > 0),
  CONSTRAINT reflection_scale_version CHECK (feeling_version = 1),
  CONSTRAINT reflection_status CHECK (status IN ('draft','submitted','skipped')),
  CONSTRAINT reflection_feeling CHECK (feeling IS NULL OR feeling IN ('a_lot_worse','a_little_worse','about_the_same','a_little_better','a_lot_better')),
  CONSTRAINT reflection_input_method CHECK ((reflection_text IS NULL AND input_method IS NULL) OR (reflection_text IS NOT NULL AND input_method = 'typed')),
  CONSTRAINT reflection_terminal_content CHECK (status = 'draft' OR (status = 'skipped' AND feeling IS NULL AND reflection_text IS NULL) OR (status = 'submitted' AND (feeling IS NOT NULL OR reflection_text IS NOT NULL))),
  CONSTRAINT reflection_text_length CHECK (reflection_text IS NULL OR char_length(reflection_text) <= 10000)
);
--> statement-breakpoint
CREATE TABLE justgo.reflection_actions (
  user_id uuid NOT NULL,
  id uuid NOT NULL,
  attempt_id uuid NOT NULL,
  action text NOT NULL,
  input_digest text NOT NULL,
  response jsonb NOT NULL,
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id, attempt_id) REFERENCES justgo.attempts (user_id, id),
  CONSTRAINT reflection_action_kind CHECK (action IN ('draft','final','skip')),
  CONSTRAINT reflection_action_digest CHECK (input_digest ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE INDEX reflection_actions_attempt_idx ON justgo.reflection_actions (user_id, attempt_id);
--> statement-breakpoint
ALTER TABLE justgo.reflections ENABLE ROW LEVEL SECURITY;
ALTER TABLE justgo.reflections FORCE ROW LEVEL SECURITY;
CREATE POLICY migration_maintenance ON justgo.reflections TO justgo_migrator USING (true) WITH CHECK (true);
CREATE POLICY owner_access ON justgo.reflections TO justgo_runtime USING (user_id = (select justgo.current_user_id())) WITH CHECK (user_id = (select justgo.current_user_id()));
GRANT SELECT, INSERT, UPDATE ON justgo.reflections TO justgo_runtime;
--> statement-breakpoint
ALTER TABLE justgo.reflection_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE justgo.reflection_actions FORCE ROW LEVEL SECURITY;
CREATE POLICY migration_maintenance ON justgo.reflection_actions TO justgo_migrator USING (true) WITH CHECK (true);
CREATE POLICY owner_access ON justgo.reflection_actions TO justgo_runtime USING (user_id = (select justgo.current_user_id())) WITH CHECK (user_id = (select justgo.current_user_id()));
GRANT SELECT, INSERT ON justgo.reflection_actions TO justgo_runtime;
