-- Old six-digit values cannot be converted without the server-held HMAC key.
-- Cancel legacy transfers and erase those values; accounts/sessions are untouched.
UPDATE "justgo"."device_transfers"
SET "cancelled_at" = coalesce("cancelled_at", now()), "verification" = repeat('0', 64);
--> statement-breakpoint
ALTER TABLE "justgo"."device_transfers" ADD COLUMN "verification_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "justgo"."device_transfers" ADD CONSTRAINT "transfers_verification_hmac" CHECK ("justgo"."device_transfers"."verification" ~ '^[a-f0-9]{64}$');--> statement-breakpoint
ALTER TABLE "justgo"."device_transfers" ADD CONSTRAINT "transfers_verification_attempts" CHECK ("justgo"."device_transfers"."verification_attempts" between 0 and 5);
