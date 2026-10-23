ALTER TABLE "justgo"."journal_versions" DROP CONSTRAINT "journal_versions_user_id_attempt_id_attempts_user_id_id_fk";
--> statement-breakpoint
ALTER TABLE "justgo"."journal_versions" ADD COLUMN "context" jsonb;--> statement-breakpoint
ALTER TABLE "justgo"."journal_versions" ADD CONSTRAINT "journal_versions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "justgo"."users"("id") ON DELETE no action ON UPDATE no action;