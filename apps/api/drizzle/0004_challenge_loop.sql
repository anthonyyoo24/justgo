CREATE TABLE "justgo"."attempts" (
	"user_id" uuid NOT NULL,
	"id" uuid NOT NULL,
	"card_id" text NOT NULL,
	"venue_id" text NOT NULL,
	"challenge_id" text NOT NULL,
	"revision_id" text NOT NULL,
	"level_id" text NOT NULL,
	"queue_version" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"deadline_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"completion_date" text,
	"time_zone" text,
	"elapsed_seconds" integer,
	CONSTRAINT "attempts_user_id_id_pk" PRIMARY KEY("user_id","id"),
	CONSTRAINT "attempt_status" CHECK ("justgo"."attempts"."status" in ('active','completed','given_up')),
	CONSTRAINT "attempt_outcome_fields" CHECK (("justgo"."attempts"."status" = 'active' and "justgo"."attempts"."ended_at" is null and "justgo"."attempts"."time_zone" is null and "justgo"."attempts"."elapsed_seconds" is null and "justgo"."attempts"."completion_date" is null) or ("justgo"."attempts"."status" <> 'active' and "justgo"."attempts"."ended_at" >= "justgo"."attempts"."started_at" and "justgo"."attempts"."time_zone" is not null and "justgo"."attempts"."elapsed_seconds" >= 0 and (("justgo"."attempts"."status" = 'completed' and "justgo"."attempts"."completion_date" is not null) or ("justgo"."attempts"."status" = 'given_up' and "justgo"."attempts"."completion_date" is null)))),
	CONSTRAINT "attempt_deadline" CHECK ("justgo"."attempts"."deadline_at" > "justgo"."attempts"."started_at")
);
--> statement-breakpoint
CREATE TABLE "justgo"."challenge_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"venue_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "justgo"."challenge_revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"challenge_id" text NOT NULL,
	"level_id" text NOT NULL,
	"text" text NOT NULL,
	"subtext" text,
	"duration_seconds" integer NOT NULL,
	CONSTRAINT "positive_duration" CHECK ("justgo"."challenge_revisions"."duration_seconds" > 0)
);
--> statement-breakpoint
CREATE TABLE "justgo"."challenges" (
	"id" text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE "justgo"."deck_skips" (
	"user_id" uuid NOT NULL,
	"id" uuid NOT NULL,
	"venue_id" text NOT NULL,
	"card_id" text NOT NULL,
	"revision_id" text NOT NULL,
	"queue_version" integer NOT NULL,
	CONSTRAINT "deck_skips_user_id_id_pk" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "justgo"."levels" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "justgo"."venue_cards" (
	"id" text PRIMARY KEY NOT NULL,
	"venue_id" text NOT NULL,
	"revision_id" text NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "justgo"."venue_queues" (
	"user_id" uuid NOT NULL,
	"venue_id" text NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"card_ids" text[] NOT NULL,
	CONSTRAINT "venue_queues_user_id_venue_id_pk" PRIMARY KEY("user_id","venue_id"),
	CONSTRAINT "queue_version_positive" CHECK ("justgo"."venue_queues"."version" >= 0)
);
--> statement-breakpoint
CREATE TABLE "justgo"."venues" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "justgo"."attempts" ADD CONSTRAINT "attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "justgo"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "justgo"."attempts" ADD CONSTRAINT "attempts_card_id_venue_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "justgo"."venue_cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "justgo"."attempts" ADD CONSTRAINT "attempts_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "justgo"."venues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "justgo"."attempts" ADD CONSTRAINT "attempts_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "justgo"."challenges"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "justgo"."attempts" ADD CONSTRAINT "attempts_revision_id_challenge_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "justgo"."challenge_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "justgo"."attempts" ADD CONSTRAINT "attempts_level_id_levels_id_fk" FOREIGN KEY ("level_id") REFERENCES "justgo"."levels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "justgo"."challenge_preferences" ADD CONSTRAINT "challenge_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "justgo"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "justgo"."challenge_preferences" ADD CONSTRAINT "challenge_preferences_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "justgo"."venues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "justgo"."challenge_revisions" ADD CONSTRAINT "challenge_revisions_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "justgo"."challenges"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "justgo"."challenge_revisions" ADD CONSTRAINT "challenge_revisions_level_id_levels_id_fk" FOREIGN KEY ("level_id") REFERENCES "justgo"."levels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "justgo"."deck_skips" ADD CONSTRAINT "deck_skips_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "justgo"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "justgo"."deck_skips" ADD CONSTRAINT "deck_skips_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "justgo"."venues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "justgo"."deck_skips" ADD CONSTRAINT "deck_skips_card_id_venue_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "justgo"."venue_cards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "justgo"."deck_skips" ADD CONSTRAINT "deck_skips_revision_id_challenge_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "justgo"."challenge_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "justgo"."venue_cards" ADD CONSTRAINT "venue_cards_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "justgo"."venues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "justgo"."venue_cards" ADD CONSTRAINT "venue_cards_revision_id_challenge_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "justgo"."challenge_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "justgo"."venue_queues" ADD CONSTRAINT "venue_queues_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "justgo"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "justgo"."venue_queues" ADD CONSTRAINT "venue_queues_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "justgo"."venues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "one_active_attempt" ON "justgo"."attempts" USING btree ("user_id") WHERE "justgo"."attempts"."status" = 'active';--> statement-breakpoint
CREATE INDEX "attempt_owner_end_idx" ON "justgo"."attempts" USING btree ("user_id","ended_at");--> statement-breakpoint
CREATE UNIQUE INDEX "venue_card_position" ON "justgo"."venue_cards" USING btree ("venue_id","position");
--> statement-breakpoint
ALTER TABLE justgo.levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE justgo.levels FORCE ROW LEVEL SECURITY;
CREATE POLICY migration_maintenance ON justgo.levels TO justgo_migrator USING (true) WITH CHECK (true);
CREATE POLICY catalog_read ON justgo.levels FOR SELECT TO justgo_runtime USING ((select justgo.current_user_id()) is not null);
GRANT SELECT ON justgo.levels TO justgo_runtime;

--> statement-breakpoint
ALTER TABLE justgo.venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE justgo.venues FORCE ROW LEVEL SECURITY;
CREATE POLICY migration_maintenance ON justgo.venues TO justgo_migrator USING (true) WITH CHECK (true);
CREATE POLICY catalog_read ON justgo.venues FOR SELECT TO justgo_runtime USING ((select justgo.current_user_id()) is not null);
GRANT SELECT ON justgo.venues TO justgo_runtime;

--> statement-breakpoint
ALTER TABLE justgo.challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE justgo.challenges FORCE ROW LEVEL SECURITY;
CREATE POLICY migration_maintenance ON justgo.challenges TO justgo_migrator USING (true) WITH CHECK (true);
CREATE POLICY catalog_read ON justgo.challenges FOR SELECT TO justgo_runtime USING ((select justgo.current_user_id()) is not null);
GRANT SELECT ON justgo.challenges TO justgo_runtime;

--> statement-breakpoint
ALTER TABLE justgo.challenge_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE justgo.challenge_revisions FORCE ROW LEVEL SECURITY;
CREATE POLICY migration_maintenance ON justgo.challenge_revisions TO justgo_migrator USING (true) WITH CHECK (true);
CREATE POLICY catalog_read ON justgo.challenge_revisions FOR SELECT TO justgo_runtime USING ((select justgo.current_user_id()) is not null);
GRANT SELECT ON justgo.challenge_revisions TO justgo_runtime;

--> statement-breakpoint
ALTER TABLE justgo.venue_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE justgo.venue_cards FORCE ROW LEVEL SECURITY;
CREATE POLICY migration_maintenance ON justgo.venue_cards TO justgo_migrator USING (true) WITH CHECK (true);
CREATE POLICY catalog_read ON justgo.venue_cards FOR SELECT TO justgo_runtime USING ((select justgo.current_user_id()) is not null);
GRANT SELECT ON justgo.venue_cards TO justgo_runtime;

--> statement-breakpoint
ALTER TABLE justgo.challenge_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE justgo.challenge_preferences FORCE ROW LEVEL SECURITY;
CREATE POLICY migration_maintenance ON justgo.challenge_preferences TO justgo_migrator USING (true) WITH CHECK (true);
CREATE POLICY owner_access ON justgo.challenge_preferences TO justgo_runtime USING (user_id = (select justgo.current_user_id())) WITH CHECK (user_id = (select justgo.current_user_id()));
GRANT SELECT, INSERT, UPDATE ON justgo.challenge_preferences TO justgo_runtime;

--> statement-breakpoint
ALTER TABLE justgo.venue_queues ENABLE ROW LEVEL SECURITY;
ALTER TABLE justgo.venue_queues FORCE ROW LEVEL SECURITY;
CREATE POLICY migration_maintenance ON justgo.venue_queues TO justgo_migrator USING (true) WITH CHECK (true);
CREATE POLICY owner_access ON justgo.venue_queues TO justgo_runtime USING (user_id = (select justgo.current_user_id())) WITH CHECK (user_id = (select justgo.current_user_id()));
GRANT SELECT, INSERT, UPDATE ON justgo.venue_queues TO justgo_runtime;

--> statement-breakpoint
ALTER TABLE justgo.deck_skips ENABLE ROW LEVEL SECURITY;
ALTER TABLE justgo.deck_skips FORCE ROW LEVEL SECURITY;
CREATE POLICY migration_maintenance ON justgo.deck_skips TO justgo_migrator USING (true) WITH CHECK (true);
CREATE POLICY owner_access ON justgo.deck_skips TO justgo_runtime USING (user_id = (select justgo.current_user_id())) WITH CHECK (user_id = (select justgo.current_user_id()));
GRANT SELECT, INSERT, UPDATE ON justgo.deck_skips TO justgo_runtime;

--> statement-breakpoint
ALTER TABLE justgo.attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE justgo.attempts FORCE ROW LEVEL SECURITY;
CREATE POLICY migration_maintenance ON justgo.attempts TO justgo_migrator USING (true) WITH CHECK (true);
CREATE POLICY owner_access ON justgo.attempts TO justgo_runtime USING (user_id = (select justgo.current_user_id())) WITH CHECK (user_id = (select justgo.current_user_id()));
GRANT SELECT, INSERT, UPDATE ON justgo.attempts TO justgo_runtime;

--> statement-breakpoint
INSERT INTO justgo.levels VALUES ('level-1', 'Level 1');
INSERT INTO justgo.venues VALUES ('streets','Streets'), ('park','Park'), ('gym','Gym'), ('cafe','Cafe'), ('bookstore','Bookstore'), ('bars','Bars & Clubs');
INSERT INTO justgo.challenges VALUES ('st-01');
INSERT INTO justgo.challenge_revisions VALUES ('st-01-v1', 'st-01', 'level-1', 'Say hello to someone you pass.', NULL, 300);
INSERT INTO justgo.venue_cards VALUES ('ST-01', 'streets', 'st-01-v1', 1);
INSERT INTO justgo.challenges VALUES ('st-02');
INSERT INTO justgo.challenge_revisions VALUES ('st-02-v1', 'st-02', 'level-1', 'Give someone a compliment on their outfit.', NULL, 300);
INSERT INTO justgo.venue_cards VALUES ('ST-02', 'streets', 'st-02-v1', 2);
INSERT INTO justgo.challenges VALUES ('st-03');
INSERT INTO justgo.challenge_revisions VALUES ('st-03-v1', 'st-03', 'level-1', 'Ask someone for directions to a place you want to visit.', NULL, 300);
INSERT INTO justgo.venue_cards VALUES ('ST-03', 'streets', 'st-03-v1', 3);
INSERT INTO justgo.challenges VALUES ('st-04');
INSERT INTO justgo.challenge_revisions VALUES ('st-04-v1', 'st-04', 'level-1', 'Ask someone to recommend a coffee place nearby.', NULL, 300);
INSERT INTO justgo.venue_cards VALUES ('ST-04', 'streets', 'st-04-v1', 4);
INSERT INTO justgo.challenges VALUES ('st-05');
INSERT INTO justgo.challenge_revisions VALUES ('st-05-v1', 'st-05', 'level-1', 'Make a friendly comment about the weather to someone nearby.', NULL, 300);
INSERT INTO justgo.venue_cards VALUES ('ST-05', 'streets', 'st-05-v1', 5);
INSERT INTO justgo.challenges VALUES ('st-06');
INSERT INTO justgo.challenge_revisions VALUES ('st-06-v1', 'st-06', 'level-1', 'Tell someone their dog is cute.', NULL, 300);
INSERT INTO justgo.venue_cards VALUES ('ST-06', 'streets', 'st-06-v1', 6);
INSERT INTO justgo.challenges VALUES ('st-07');
INSERT INTO justgo.challenge_revisions VALUES ('st-07-v1', 'st-07', 'level-1', 'Ask someone where they’d recommend getting lunch.', NULL, 300);
INSERT INTO justgo.venue_cards VALUES ('ST-07', 'streets', 'st-07-v1', 7);
INSERT INTO justgo.challenges VALUES ('st-08');
INSERT INTO justgo.challenge_revisions VALUES ('st-08-v1', 'st-08', 'level-1', 'Ask someone where the nearest convenience store is.', NULL, 300);
INSERT INTO justgo.venue_cards VALUES ('ST-08', 'streets', 'st-08-v1', 8);
INSERT INTO justgo.challenges VALUES ('st-09');
INSERT INTO justgo.challenge_revisions VALUES ('st-09-v1', 'st-09', 'level-1', 'Ask someone where they got an item they’re wearing or carrying.', NULL, 300);
INSERT INTO justgo.venue_cards VALUES ('ST-09', 'streets', 'st-09-v1', 9);
INSERT INTO justgo.challenges VALUES ('st-10');
INSERT INTO justgo.challenge_revisions VALUES ('st-10-v1', 'st-10', 'level-1', 'Give someone a compliment on their shoes.', NULL, 300);
INSERT INTO justgo.venue_cards VALUES ('ST-10', 'streets', 'st-10-v1', 10);
INSERT INTO justgo.challenges VALUES ('pk-01');
INSERT INTO justgo.challenge_revisions VALUES ('pk-01-v1', 'pk-01', 'level-1', 'Say hello to someone passing on the path.', NULL, 300);
INSERT INTO justgo.venue_cards VALUES ('PK-01', 'park', 'pk-01-v1', 1);
INSERT INTO justgo.venue_cards VALUES ('PK-02', 'park', 'st-05-v1', 2);
INSERT INTO justgo.venue_cards VALUES ('PK-03', 'park', 'st-06-v1', 3);
INSERT INTO justgo.challenges VALUES ('pk-04');
INSERT INTO justgo.challenge_revisions VALUES ('pk-04-v1', 'pk-04', 'level-1', 'Ask someone on a bench whether you can sit beside them.', NULL, 300);
INSERT INTO justgo.venue_cards VALUES ('PK-04', 'park', 'pk-04-v1', 4);
INSERT INTO justgo.venue_cards VALUES ('PK-05', 'park', 'st-09-v1', 5);
INSERT INTO justgo.challenges VALUES ('pk-06');
INSERT INTO justgo.challenge_revisions VALUES ('pk-06-v1', 'pk-06', 'level-1', 'Ask someone sitting nearby how their day is going.', NULL, 300);
INSERT INTO justgo.venue_cards VALUES ('PK-06', 'park', 'pk-06-v1', 6);
INSERT INTO justgo.challenges VALUES ('pk-07');
INSERT INTO justgo.challenge_revisions VALUES ('pk-07-v1', 'pk-07', 'level-1', 'Ask someone to recommend a nearby coffee place.', NULL, 300);
INSERT INTO justgo.venue_cards VALUES ('PK-07', 'park', 'pk-07-v1', 7);
INSERT INTO justgo.challenges VALUES ('pk-08');
INSERT INTO justgo.challenge_revisions VALUES ('pk-08-v1', 'pk-08', 'level-1', 'Give someone a compliment on something they’re wearing.', NULL, 300);
INSERT INTO justgo.venue_cards VALUES ('PK-08', 'park', 'pk-08-v1', 8);
INSERT INTO justgo.challenges VALUES ('pk-09');
INSERT INTO justgo.challenge_revisions VALUES ('pk-09-v1', 'pk-09', 'level-1', 'Ask a dog owner what kind of dog they have.', NULL, 300);
INSERT INTO justgo.venue_cards VALUES ('PK-09', 'park', 'pk-09-v1', 9);
INSERT INTO justgo.challenges VALUES ('pk-10');
INSERT INTO justgo.challenge_revisions VALUES ('pk-10-v1', 'pk-10', 'level-1', 'Ask someone where the nearest washroom is.', NULL, 300);
INSERT INTO justgo.venue_cards VALUES ('PK-10', 'park', 'pk-10-v1', 10);
INSERT INTO justgo.challenges VALUES ('gy-01');
INSERT INTO justgo.challenge_revisions VALUES ('gy-01-v1', 'gy-01', 'level-1', 'Smile and ask someone at the front desk how it’s going.', NULL, 300);
INSERT INTO justgo.venue_cards VALUES ('GY-01', 'gym', 'gy-01-v1', 1);
INSERT INTO justgo.challenges VALUES ('gy-02');
INSERT INTO justgo.challenge_revisions VALUES ('gy-02-v1', 'gy-02', 'level-1', 'Ask someone whether they’re using a piece of equipment you need.', NULL, 300);
INSERT INTO justgo.venue_cards VALUES ('GY-02', 'gym', 'gy-02-v1', 2);
INSERT INTO justgo.challenges VALUES ('gy-03');
INSERT INTO justgo.challenge_revisions VALUES ('gy-03-v1', 'gy-03', 'level-1', 'Ask someone how many sets they have left.', NULL, 300);
INSERT INTO justgo.venue_cards VALUES ('GY-03', 'gym', 'gy-03-v1', 3);
INSERT INTO justgo.challenges VALUES ('gy-04');
INSERT INTO justgo.challenge_revisions VALUES ('gy-04-v1', 'gy-04', 'level-1', 'Ask someone how to use a machine you’re unfamiliar with.', NULL, 300);
INSERT INTO justgo.venue_cards VALUES ('GY-04', 'gym', 'gy-04-v1', 4);
INSERT INTO justgo.challenges VALUES ('gy-05');
INSERT INTO justgo.challenge_revisions VALUES ('gy-05-v1', 'gy-05', 'level-1', 'Ask someone what an exercise they’re doing is called.', NULL, 300);
INSERT INTO justgo.venue_cards VALUES ('GY-05', 'gym', 'gy-05-v1', 5);
INSERT INTO justgo.challenges VALUES ('gy-06');
INSERT INTO justgo.challenge_revisions VALUES ('gy-06-v1', 'gy-06', 'level-1', 'Ask someone where to find a piece of equipment.', NULL, 300);
INSERT INTO justgo.venue_cards VALUES ('GY-06', 'gym', 'gy-06-v1', 6);
INSERT INTO justgo.challenges VALUES ('gy-07');
INSERT INTO justgo.challenge_revisions VALUES ('gy-07-v1', 'gy-07', 'level-1', 'Ask someone whether they’ve tried one of the gym’s classes.', NULL, 300);
INSERT INTO justgo.venue_cards VALUES ('GY-07', 'gym', 'gy-07-v1', 7);
INSERT INTO justgo.challenges VALUES ('gy-08');
INSERT INTO justgo.challenge_revisions VALUES ('gy-08-v1', 'gy-08', 'level-1', 'Ask someone at the front desk when the gym is least busy.', NULL, 300);
INSERT INTO justgo.venue_cards VALUES ('GY-08', 'gym', 'gy-08-v1', 8);
INSERT INTO justgo.challenges VALUES ('gy-09');
INSERT INTO justgo.challenge_revisions VALUES ('gy-09-v1', 'gy-09', 'level-1', 'Introduce yourself to someone you recognize between sets.', NULL, 300);
INSERT INTO justgo.venue_cards VALUES ('GY-09', 'gym', 'gy-09-v1', 9);
INSERT INTO justgo.challenges VALUES ('gy-10');
INSERT INTO justgo.challenge_revisions VALUES ('gy-10-v1', 'gy-10', 'level-1', 'Ask someone nearby how their workout is going.', NULL, 300);
INSERT INTO justgo.venue_cards VALUES ('GY-10', 'gym', 'gy-10-v1', 10);
INSERT INTO justgo.challenges VALUES ('gy-11');
INSERT INTO justgo.challenge_revisions VALUES ('gy-11-v1', 'gy-11', 'level-1', 'Ask someone if you can take turns using their machine.', NULL, 300);
INSERT INTO justgo.venue_cards VALUES ('GY-11', 'gym', 'gy-11-v1', 11);
INSERT INTO justgo.challenges VALUES ('cf-01');
INSERT INTO justgo.challenge_revisions VALUES ('cf-01-v1', 'cf-01', 'level-1', 'Smile and ask the barista how it’s going.', NULL, 300);
INSERT INTO justgo.venue_cards VALUES ('CF-01', 'cafe', 'cf-01-v1', 1);
INSERT INTO justgo.challenges VALUES ('cf-02');
INSERT INTO justgo.challenge_revisions VALUES ('cf-02-v1', 'cf-02', 'level-1', 'Ask the barista to recommend a drink.', NULL, 300);
INSERT INTO justgo.venue_cards VALUES ('CF-02', 'cafe', 'cf-02-v1', 2);
INSERT INTO justgo.challenges VALUES ('cf-03');
INSERT INTO justgo.challenge_revisions VALUES ('cf-03-v1', 'cf-03', 'level-1', 'Ask someone in line what they’re going to order.', NULL, 300);
INSERT INTO justgo.venue_cards VALUES ('CF-03', 'cafe', 'cf-03-v1', 3);
INSERT INTO justgo.challenges VALUES ('cf-04');
INSERT INTO justgo.challenge_revisions VALUES ('cf-04-v1', 'cf-04', 'level-1', 'Ask someone at the pickup counter what drink they got.', NULL, 300);
INSERT INTO justgo.venue_cards VALUES ('CF-04', 'cafe', 'cf-04-v1', 4);
INSERT INTO justgo.challenges VALUES ('cf-05');
INSERT INTO justgo.challenge_revisions VALUES ('cf-05-v1', 'cf-05', 'level-1', 'Ask someone sitting beside you to watch your things while you use the bathroom.', NULL, 300);
INSERT INTO justgo.venue_cards VALUES ('CF-05', 'cafe', 'cf-05-v1', 5);
INSERT INTO justgo.challenges VALUES ('cf-06');
INSERT INTO justgo.challenge_revisions VALUES ('cf-06-v1', 'cf-06', 'level-1', 'Give someone a genuine compliment as you’re leaving.', NULL, 300);
INSERT INTO justgo.venue_cards VALUES ('CF-06', 'cafe', 'cf-06-v1', 6);
INSERT INTO justgo.challenges VALUES ('cf-07');
INSERT INTO justgo.challenge_revisions VALUES ('cf-07-v1', 'cf-07', 'level-1', 'Ask someone sitting nearby what they’re working on.', NULL, 300);
INSERT INTO justgo.venue_cards VALUES ('CF-07', 'cafe', 'cf-07-v1', 7);
INSERT INTO justgo.challenges VALUES ('cf-08');
INSERT INTO justgo.challenge_revisions VALUES ('cf-08-v1', 'cf-08', 'level-1', 'Ask someone in line whether they’ve tried an item on the menu.', NULL, 300);
INSERT INTO justgo.venue_cards VALUES ('CF-08', 'cafe', 'cf-08-v1', 8);
INSERT INTO justgo.challenges VALUES ('cf-09');
INSERT INTO justgo.challenge_revisions VALUES ('cf-09-v1', 'cf-09', 'level-1', 'Ask the barista which pastry they’d pick.', NULL, 300);
INSERT INTO justgo.venue_cards VALUES ('CF-09', 'cafe', 'cf-09-v1', 9);
INSERT INTO justgo.challenges VALUES ('cf-10');
INSERT INTO justgo.challenge_revisions VALUES ('cf-10-v1', 'cf-10', 'level-1', 'Ask someone sitting beside you if they know the Wi-Fi password.', NULL, 300);
INSERT INTO justgo.venue_cards VALUES ('CF-10', 'cafe', 'cf-10-v1', 10);
INSERT INTO justgo.challenges VALUES ('bk-01');
INSERT INTO justgo.challenge_revisions VALUES ('bk-01-v1', 'bk-01', 'level-1', 'Smile and ask a staff member how their day is going.', NULL, 300);
INSERT INTO justgo.venue_cards VALUES ('BK-01', 'bookstore', 'bk-01-v1', 1);
INSERT INTO justgo.challenges VALUES ('bk-02');
INSERT INTO justgo.challenge_revisions VALUES ('bk-02-v1', 'bk-02', 'level-1', 'Ask someone for a book recommendation.', NULL, 300);
INSERT INTO justgo.venue_cards VALUES ('BK-02', 'bookstore', 'bk-02-v1', 2);
INSERT INTO justgo.challenges VALUES ('bk-03');
INSERT INTO justgo.challenge_revisions VALUES ('bk-03-v1', 'bk-03', 'level-1', 'Ask a staff member to help you find a book.', NULL, 300);
INSERT INTO justgo.venue_cards VALUES ('BK-03', 'bookstore', 'bk-03-v1', 3);
INSERT INTO justgo.challenges VALUES ('bk-04');
INSERT INTO justgo.challenge_revisions VALUES ('bk-04-v1', 'bk-04', 'level-1', 'Ask a staff member what they’re currently reading.', NULL, 300);
INSERT INTO justgo.venue_cards VALUES ('BK-04', 'bookstore', 'bk-04-v1', 4);
INSERT INTO justgo.challenges VALUES ('bk-05');
INSERT INTO justgo.challenge_revisions VALUES ('bk-05-v1', 'bk-05', 'level-1', 'Ask someone beside you whether they’ve read a book you’re considering.', NULL, 300);
INSERT INTO justgo.venue_cards VALUES ('BK-05', 'bookstore', 'bk-05-v1', 5);
INSERT INTO justgo.challenges VALUES ('bk-06');
INSERT INTO justgo.challenge_revisions VALUES ('bk-06-v1', 'bk-06', 'level-1', 'Ask someone nearby to help you choose between two books.', NULL, 300);
INSERT INTO justgo.venue_cards VALUES ('BK-06', 'bookstore', 'bk-06-v1', 6);
INSERT INTO justgo.challenges VALUES ('bk-07');
INSERT INTO justgo.challenge_revisions VALUES ('bk-07-v1', 'bk-07', 'level-1', 'Ask someone browsing an unfamiliar genre where you should start.', NULL, 300);
INSERT INTO justgo.venue_cards VALUES ('BK-07', 'bookstore', 'bk-07-v1', 7);
INSERT INTO justgo.challenges VALUES ('bk-08');
INSERT INTO justgo.challenge_revisions VALUES ('bk-08-v1', 'bk-08', 'level-1', 'Ask a staff member to help you find a section you want to explore.', NULL, 300);
INSERT INTO justgo.venue_cards VALUES ('BK-08', 'bookstore', 'bk-08-v1', 8);
INSERT INTO justgo.challenges VALUES ('bk-09');
INSERT INTO justgo.challenge_revisions VALUES ('bk-09-v1', 'bk-09', 'level-1', 'Ask someone reading nearby what book they’re reading.', NULL, 300);
INSERT INTO justgo.venue_cards VALUES ('BK-09', 'bookstore', 'bk-09-v1', 9);
INSERT INTO justgo.challenges VALUES ('bk-10');
INSERT INTO justgo.challenge_revisions VALUES ('bk-10-v1', 'bk-10', 'level-1', 'Ask someone browsing beside you what kind of books they enjoy.', NULL, 300);
INSERT INTO justgo.venue_cards VALUES ('BK-10', 'bookstore', 'bk-10-v1', 10);
INSERT INTO justgo.challenges VALUES ('bc-01');
INSERT INTO justgo.challenge_revisions VALUES ('bc-01-v1', 'bc-01', 'level-1', 'Introduce yourself to someone nearby.', NULL, 300);
INSERT INTO justgo.venue_cards VALUES ('BC-01', 'bars', 'bc-01-v1', 1);
INSERT INTO justgo.challenges VALUES ('bc-02');
INSERT INTO justgo.challenge_revisions VALUES ('bc-02-v1', 'bc-02', 'level-1', 'Ask someone nearby what drink they ordered.', NULL, 300);
INSERT INTO justgo.venue_cards VALUES ('BC-02', 'bars', 'bc-02-v1', 2);
INSERT INTO justgo.challenges VALUES ('bc-03');
INSERT INTO justgo.challenge_revisions VALUES ('bc-03-v1', 'bc-03', 'level-1', 'Ask the bartender to recommend a drink.', NULL, 300);
INSERT INTO justgo.venue_cards VALUES ('BC-03', 'bars', 'bc-03-v1', 3);
INSERT INTO justgo.challenges VALUES ('bc-04');
INSERT INTO justgo.challenge_revisions VALUES ('bc-04-v1', 'bc-04', 'level-1', 'Give someone nearby a genuine compliment.', NULL, 300);
INSERT INTO justgo.venue_cards VALUES ('BC-04', 'bars', 'bc-04-v1', 4);
INSERT INTO justgo.challenges VALUES ('bc-05');
INSERT INTO justgo.challenge_revisions VALUES ('bc-05-v1', 'bc-05', 'level-1', 'Ask someone in the entrance line whether it’s been moving.', NULL, 300);
INSERT INTO justgo.venue_cards VALUES ('BC-05', 'bars', 'bc-05-v1', 5);
INSERT INTO justgo.challenges VALUES ('bc-06');
INSERT INTO justgo.challenge_revisions VALUES ('bc-06-v1', 'bc-06', 'level-1', 'Ask someone near you on the dance floor if they know the song.', NULL, 300);
INSERT INTO justgo.venue_cards VALUES ('BC-06', 'bars', 'bc-06-v1', 6);
INSERT INTO justgo.challenges VALUES ('bc-07');
INSERT INTO justgo.challenge_revisions VALUES ('bc-07-v1', 'bc-07', 'level-1', 'Raise your drink and say cheers to someone nearby.', NULL, 300);
INSERT INTO justgo.venue_cards VALUES ('BC-07', 'bars', 'bc-07-v1', 7);
INSERT INTO justgo.challenges VALUES ('bc-08');
INSERT INTO justgo.challenge_revisions VALUES ('bc-08-v1', 'bc-08', 'level-1', 'Ask someone nearby if they’re celebrating anything tonight.', NULL, 300);
INSERT INTO justgo.venue_cards VALUES ('BC-08', 'bars', 'bc-08-v1', 8);
INSERT INTO justgo.challenges VALUES ('bc-09');
INSERT INTO justgo.challenge_revisions VALUES ('bc-09-v1', 'bc-09', 'level-1', 'Ask someone near the bar what drink they’re going to order.', NULL, 300);
INSERT INTO justgo.venue_cards VALUES ('BC-09', 'bars', 'bc-09-v1', 9);
INSERT INTO justgo.challenges VALUES ('bc-10');
INSERT INTO justgo.challenge_revisions VALUES ('bc-10-v1', 'bc-10', 'level-1', 'Make a friendly comment about the song to someone beside you on the dance floor.', NULL, 300);
INSERT INTO justgo.venue_cards VALUES ('BC-10', 'bars', 'bc-10-v1', 10);

--> statement-breakpoint
CREATE FUNCTION justgo.immutable_revision() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN RAISE EXCEPTION 'Challenge revisions are immutable'; END;
$$;
REVOKE ALL ON FUNCTION justgo.immutable_revision() FROM PUBLIC;
CREATE TRIGGER immutable_revision BEFORE UPDATE OR DELETE ON justgo.challenge_revisions FOR EACH ROW EXECUTE FUNCTION justgo.immutable_revision();
