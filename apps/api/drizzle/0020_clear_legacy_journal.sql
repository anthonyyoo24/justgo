-- Owner-approved reset of old server journal content only. Keep accounts,
-- credentials, completed IDs, frozen dates and historical challenge context.
LOCK TABLE justgo.attempts, justgo.attempt_patch_receipts IN ACCESS EXCLUSIVE MODE;
UPDATE justgo.attempts SET reflection_feeling=NULL,reflection_text=NULL,reflection_revision=0
WHERE reflection_feeling IS NOT NULL OR reflection_text IS NOT NULL OR reflection_revision<>0;
DELETE FROM justgo.attempt_patch_receipts;
