INSERT INTO justgo.challenge_revisions (id, challenge_id, level_id, text, subtext, duration_seconds)
SELECT 'bc-10-v2', challenge_id, level_id,
  'Comment on the song to someone beside you on the dance floor.',
  subtext, duration_seconds
FROM justgo.challenge_revisions
WHERE id = 'bc-10-v1';
--> statement-breakpoint
UPDATE justgo.venue_cards
SET revision_id = 'bc-10-v2'
WHERE id = 'BC-10' AND revision_id = 'bc-10-v1';
