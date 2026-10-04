-- Phase 07.1 additive compatibility migration. Legacy protocols remain until 07.5.
CREATE TABLE "justgo"."attempt_patch_receipts" (
	"user_id" uuid NOT NULL,
	"id" uuid NOT NULL,
	"attempt_id" uuid NOT NULL,
	"input_digest" text NOT NULL,
	"applied_revision" integer NOT NULL,
	CONSTRAINT "attempt_patch_receipts_user_id_id_pk" PRIMARY KEY("user_id","id"),
	CONSTRAINT "attempt_patch_digest" CHECK ("justgo"."attempt_patch_receipts"."input_digest" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "attempt_patch_revision" CHECK ("justgo"."attempt_patch_receipts"."applied_revision" > 0)
);
--> statement-breakpoint
ALTER TABLE "justgo"."attempt_patch_receipts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "justgo"."attempts" DROP CONSTRAINT "attempt_outcome_fields";--> statement-breakpoint
ALTER TABLE "justgo"."attempts" ALTER COLUMN "card_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "justgo"."attempts" ALTER COLUMN "revision_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "justgo"."attempts" ALTER COLUMN "queue_version" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "justgo"."attempts" ALTER COLUMN "deadline_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "justgo"."attempts" ADD COLUMN "activity_date" text;--> statement-breakpoint
ALTER TABLE "justgo"."attempts" ADD COLUMN "start_time_zone" text;--> statement-breakpoint
ALTER TABLE "justgo"."attempts" ADD COLUMN "legacy_display_time_zone" text;--> statement-breakpoint
ALTER TABLE "justgo"."attempts" ADD COLUMN "reflection_feeling" text;--> statement-breakpoint
ALTER TABLE "justgo"."attempts" ADD COLUMN "reflection_text" text;--> statement-breakpoint
ALTER TABLE "justgo"."attempts" ADD COLUMN "reflection_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "justgo"."challenges" ADD COLUMN "level_id" text;--> statement-breakpoint
ALTER TABLE "justgo"."challenges" ADD COLUMN "text" text;--> statement-breakpoint
ALTER TABLE "justgo"."challenges" ADD COLUMN "subtext" text;--> statement-breakpoint
ALTER TABLE "justgo"."challenges" ADD COLUMN "duration_seconds" integer;--> statement-breakpoint
ALTER TABLE "justgo"."challenges" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "justgo"."venue_cards" ADD COLUMN "challenge_id" text;--> statement-breakpoint
ALTER TABLE "justgo"."venue_cards" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
-- Select the revision currently used by venue placements. Multiple current
-- revisions require an explicit catalog decision; never pick by lexical ID.
-- An unplaced historical challenge is retained/inactive only when unambiguous.
CREATE TEMP TABLE phase07_canonical_revision ON COMMIT DROP AS
WITH placed AS (
  SELECT DISTINCT r.challenge_id, r.id AS revision_id
  FROM justgo.venue_cards vc JOIN justgo.challenge_revisions r ON r.id = vc.revision_id
)
SELECT * FROM placed
UNION ALL
SELECT r.challenge_id, r.id FROM justgo.challenge_revisions r
WHERE NOT EXISTS (SELECT 1 FROM placed p WHERE p.challenge_id = r.challenge_id);
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (
    SELECT c.id FROM justgo.challenges c
    LEFT JOIN phase07_canonical_revision r ON r.challenge_id = c.id
    GROUP BY c.id HAVING count(r.revision_id) <> 1
  ) THEN RAISE EXCEPTION 'Canonical challenge selection requires review'; END IF;
  IF EXISTS (
    SELECT 1 FROM justgo.reflections r
    JOIN justgo.attempts a ON (a.user_id, a.id) = (r.user_id, r.attempt_id)
    WHERE r.status = 'submitted' AND a.status <> 'completed'
  ) THEN RAISE EXCEPTION 'Submitted reflection has a noncompleted attempt'; END IF;
END $$;
--> statement-breakpoint
UPDATE justgo.challenges c SET
  level_id = r.level_id, text = r.text, subtext = r.subtext,
  duration_seconds = r.duration_seconds,
  active = EXISTS (SELECT 1 FROM justgo.venue_cards vc JOIN justgo.challenge_revisions vr ON vr.id = vc.revision_id WHERE vr.challenge_id = c.id)
FROM phase07_canonical_revision chosen JOIN justgo.challenge_revisions r ON r.id = chosen.revision_id
WHERE c.id = chosen.challenge_id;
UPDATE justgo.venue_cards vc SET challenge_id = r.challenge_id
FROM justgo.challenge_revisions r WHERE r.id = vc.revision_id;
-- Historical day attribution stays exactly as recorded. Its original start
-- zone is unknown: preserve the old display zone without inventing a new one.
UPDATE justgo.attempts SET activity_date = completion_date, legacy_display_time_zone = time_zone
WHERE status = 'completed';
UPDATE justgo.attempts a SET reflection_feeling = r.feeling,
  reflection_text = r.reflection_text, reflection_revision = r.revision
FROM justgo.reflections r
WHERE (a.user_id, a.id) = (r.user_id, r.attempt_id) AND a.status = 'completed' AND r.status = 'submitted';
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM justgo.attempts WHERE status = 'completed' AND (activity_date IS DISTINCT FROM completion_date OR legacy_display_time_zone IS DISTINCT FROM time_zone OR start_time_zone IS NOT NULL))
  THEN RAISE EXCEPTION 'Historical activity metadata was not preserved'; END IF;
  IF EXISTS (
    SELECT 1 FROM justgo.reflections r JOIN justgo.attempts a ON (a.user_id, a.id) = (r.user_id, r.attempt_id)
    WHERE r.status = 'submitted' AND (a.reflection_feeling IS DISTINCT FROM r.feeling OR a.reflection_text IS DISTINCT FROM r.reflection_text OR a.reflection_revision <> r.revision)
  ) THEN RAISE EXCEPTION 'Submitted reflection was not preserved'; END IF;
END $$;
ALTER TABLE justgo.challenges ALTER COLUMN level_id SET NOT NULL;
ALTER TABLE justgo.challenges ALTER COLUMN text SET NOT NULL;
ALTER TABLE justgo.challenges ALTER COLUMN duration_seconds SET NOT NULL;
ALTER TABLE justgo.venue_cards ALTER COLUMN challenge_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "justgo"."attempt_patch_receipts" ADD CONSTRAINT "attempt_patch_receipts_attempt_fk" FOREIGN KEY ("user_id","attempt_id") REFERENCES "justgo"."attempts"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attempt_patch_receipts_attempt_idx" ON "justgo"."attempt_patch_receipts" USING btree ("user_id","attempt_id");--> statement-breakpoint
ALTER TABLE "justgo"."challenges" ADD CONSTRAINT "challenges_level_id_levels_id_fk" FOREIGN KEY ("level_id") REFERENCES "justgo"."levels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "justgo"."venue_cards" ADD CONSTRAINT "venue_cards_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "justgo"."challenges"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attempt_canonical_history_idx" ON "justgo"."attempts" USING btree ("user_id","activity_date","started_at","id") WHERE "justgo"."attempts"."status" = 'completed';--> statement-breakpoint
CREATE INDEX "attempt_challenge_idx" ON "justgo"."attempts" USING btree ("challenge_id");--> statement-breakpoint
CREATE INDEX "challenges_level_idx" ON "justgo"."challenges" USING btree ("level_id");--> statement-breakpoint
CREATE INDEX "venue_cards_challenge_idx" ON "justgo"."venue_cards" USING btree ("challenge_id");--> statement-breakpoint
ALTER TABLE "justgo"."attempts" ADD CONSTRAINT "attempt_activity_date" CHECK ("justgo"."attempts"."activity_date" is null or ("justgo"."attempts"."status" = 'completed' and "justgo"."attempts"."activity_date" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'));--> statement-breakpoint
ALTER TABLE "justgo"."attempts" ADD CONSTRAINT "attempt_reflection_content" CHECK (("justgo"."attempts"."reflection_revision" = 0 and "justgo"."attempts"."reflection_feeling" is null and "justgo"."attempts"."reflection_text" is null) or ("justgo"."attempts"."status" = 'completed' and "justgo"."attempts"."reflection_revision" > 0 and ("justgo"."attempts"."reflection_feeling" is not null or "justgo"."attempts"."reflection_text" is not null)));--> statement-breakpoint
ALTER TABLE "justgo"."attempts" ADD CONSTRAINT "attempt_reflection_feeling" CHECK ("justgo"."attempts"."reflection_feeling" is null or "justgo"."attempts"."reflection_feeling" in ('a_lot_worse','a_little_worse','about_the_same','a_little_better','a_lot_better'));--> statement-breakpoint
ALTER TABLE "justgo"."attempts" ADD CONSTRAINT "attempt_reflection_text_length" CHECK ("justgo"."attempts"."reflection_text" is null or char_length("justgo"."attempts"."reflection_text") <= 10000);--> statement-breakpoint
ALTER TABLE "justgo"."attempts" ADD CONSTRAINT "attempt_outcome_fields" CHECK (("justgo"."attempts"."start_time_zone" is null and "justgo"."attempts"."card_id" is not null and "justgo"."attempts"."revision_id" is not null and "justgo"."attempts"."queue_version" is not null and "justgo"."attempts"."deadline_at" is not null and (("justgo"."attempts"."status" = 'active' and "justgo"."attempts"."ended_at" is null and "justgo"."attempts"."time_zone" is null and "justgo"."attempts"."completion_date" is null) or ("justgo"."attempts"."status" <> 'active' and "justgo"."attempts"."ended_at" is not null and "justgo"."attempts"."ended_at" >= "justgo"."attempts"."started_at" and "justgo"."attempts"."time_zone" is not null and (("justgo"."attempts"."status" = 'completed' and "justgo"."attempts"."completion_date" is not null) or ("justgo"."attempts"."status" = 'given_up' and "justgo"."attempts"."completion_date" is null))))) or ("justgo"."attempts"."start_time_zone" is not null and "justgo"."attempts"."status" = 'completed' and "justgo"."attempts"."activity_date" is not null and "justgo"."attempts"."card_id" is null and "justgo"."attempts"."revision_id" is null and "justgo"."attempts"."queue_version" is null and "justgo"."attempts"."deadline_at" is null and "justgo"."attempts"."ended_at" is null and "justgo"."attempts"."completion_date" is null and "justgo"."attempts"."time_zone" is null and "justgo"."attempts"."legacy_display_time_zone" is null));--> statement-breakpoint
ALTER TABLE "justgo"."challenges" ADD CONSTRAINT "challenge_positive_duration" CHECK ("justgo"."challenges"."duration_seconds" > 0);--> statement-breakpoint
CREATE POLICY "migration_maintenance" ON "justgo"."attempt_patch_receipts" AS PERMISSIVE FOR ALL TO "justgo_migrator" USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "owner_access" ON "justgo"."attempt_patch_receipts" AS PERMISSIVE FOR ALL TO "justgo_runtime" USING (user_id = (select justgo.current_user_id())) WITH CHECK (user_id = (select justgo.current_user_id()));
--> statement-breakpoint
ALTER TABLE justgo.attempt_patch_receipts FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON justgo.attempt_patch_receipts TO justgo_runtime;
