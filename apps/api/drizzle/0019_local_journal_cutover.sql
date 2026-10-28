ALTER TABLE "justgo"."attempts" ADD COLUMN "instruction_snapshot" text;--> statement-breakpoint
-- Coordinate deployment with old API/client retirement. This forward cutover
-- retains every legacy journal byte and receipt; downloads never acknowledge
-- deletion. Destructive contraction requires a separately approved migration.
LOCK TABLE justgo.attempts, justgo.attempt_patch_receipts IN ACCESS EXCLUSIVE MODE;
UPDATE justgo.attempts a SET instruction_snapshot=c.text
FROM justgo.challenges c WHERE c.id=a.challenge_id AND a.instruction_snapshot IS NULL;
--> statement-breakpoint
-- The runtime may create completion metadata, but can no longer store private
-- text, feeling, content revisions, or content-derived replay digests. SELECT
-- remains owner-scoped for preservation; DELETE remains for account deletion.
REVOKE INSERT, UPDATE ON justgo.attempts FROM justgo_runtime;
GRANT INSERT (user_id,id,venue_id,challenge_id,level_id,started_at,activity_date,start_time_zone,legacy_display_time_zone,instruction_snapshot)
  ON justgo.attempts TO justgo_runtime;
REVOKE INSERT, UPDATE ON justgo.attempt_patch_receipts FROM justgo_runtime;
