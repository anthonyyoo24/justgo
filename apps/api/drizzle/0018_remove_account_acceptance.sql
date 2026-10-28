-- Legal document viewing/agreement is no longer recorded. Remove only its
-- receipt table; dependent objects outside the table must fail review rather
-- than be removed through CASCADE. Account/journal and privacy markers remain.
DROP TABLE "justgo"."account_acceptances";
