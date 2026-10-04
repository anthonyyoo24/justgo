-- Proposed Phase 07.5 contraction. NOT a registered migration or rollout command.
-- Only the disposable migration rehearsal enables this guard. Final cutover
-- needs the accepted 07.2–07.4 callers and a fresh reviewed migration/snapshot.
DO $$ BEGIN
  IF current_database() <> 'justgo_test' OR current_setting('justgo.phase07_rehearsal', true) IS DISTINCT FROM 'on'
  THEN RAISE EXCEPTION 'Contraction rehearsal requires its disposable fixture'; END IF;
END $$;

-- Repeat the 0012 normalization/preflight for any late legacy records before
-- comparing representations. Preserve every nonblank byte and all receipts.
DO $$
DECLARE
  trim_characters CONSTANT text := U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
BEGIN
  IF EXISTS (
    SELECT 1 FROM justgo.reflections
    WHERE status = 'submitted' AND feeling IS NULL
      AND btrim(reflection_text, trim_characters) = ''
  ) OR EXISTS (
    SELECT 1 FROM justgo.attempts
    WHERE reflection_revision > 0 AND reflection_feeling IS NULL
      AND btrim(reflection_text, trim_characters) = ''
  ) THEN RAISE EXCEPTION 'Blank-only submitted reflection requires review'; END IF;
  UPDATE justgo.reflections SET reflection_text = NULL, input_method = NULL
  WHERE status = 'submitted' AND btrim(reflection_text, trim_characters) = '';
  UPDATE justgo.attempts SET reflection_text = NULL
  WHERE btrim(reflection_text, trim_characters) = '';
END $$;

-- Reconcile legacy writes made after expansion, after stopping old writers.
UPDATE justgo.attempts SET activity_date = coalesce(activity_date, completion_date),
  legacy_display_time_zone = coalesce(legacy_display_time_zone, time_zone)
WHERE status = 'completed' AND start_time_zone IS NULL;
UPDATE justgo.attempts a SET reflection_feeling = r.feeling,
  reflection_text = r.reflection_text, reflection_revision = r.revision
FROM justgo.reflections r WHERE (a.user_id, a.id) = (r.user_id, r.attempt_id)
  AND a.status = 'completed' AND r.status = 'submitted' AND r.revision > a.reflection_revision;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM justgo.attempts WHERE status = 'completed' AND activity_date IS NULL)
  THEN RAISE EXCEPTION 'Missing historical date'; END IF;
  IF EXISTS (
    SELECT 1 FROM justgo.reflections r JOIN justgo.attempts a ON (a.user_id, a.id) = (r.user_id, r.attempt_id)
    WHERE r.status = 'submitted' AND (a.status <> 'completed' OR a.reflection_revision < r.revision OR
      (a.reflection_revision = r.revision AND (a.reflection_feeling IS DISTINCT FROM r.feeling OR a.reflection_text IS DISTINCT FROM r.reflection_text)))
  ) THEN RAISE EXCEPTION 'Submitted reflection comparison failed'; END IF;
END $$;

DROP TABLE justgo.reflection_actions;
DROP TABLE justgo.reflections;
DROP TABLE justgo.deck_skips;
DROP TABLE justgo.venue_queues;
DROP TABLE justgo.challenge_preferences;
DELETE FROM justgo.attempts WHERE status <> 'completed';
ALTER TABLE justgo.attempts DROP CONSTRAINT attempt_outcome_fields;
ALTER TABLE justgo.attempts DROP CONSTRAINT attempt_deadline;
ALTER TABLE justgo.attempts DROP CONSTRAINT attempt_status;
ALTER TABLE justgo.attempts DROP CONSTRAINT attempt_activity_date;
ALTER TABLE justgo.attempts DROP CONSTRAINT attempt_reflection_content;
ALTER TABLE justgo.attempts DROP COLUMN card_id, DROP COLUMN revision_id,
  DROP COLUMN queue_version, DROP COLUMN status, DROP COLUMN deadline_at,
  DROP COLUMN ended_at, DROP COLUMN completion_date, DROP COLUMN time_zone;
ALTER TABLE justgo.attempts ALTER COLUMN activity_date SET NOT NULL;
ALTER TABLE justgo.attempts ADD CONSTRAINT attempt_reflection_content CHECK (
  (reflection_revision = 0 AND reflection_feeling IS NULL AND reflection_text IS NULL)
  OR (reflection_revision > 0 AND (reflection_feeling IS NOT NULL OR reflection_text IS NOT NULL))
);
ALTER TABLE justgo.venue_cards DROP COLUMN revision_id;
DROP TABLE justgo.challenge_revisions;
CREATE INDEX attempt_history_day_idx ON justgo.attempts (user_id, activity_date, started_at, id);
