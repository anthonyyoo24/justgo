# Support inbox and privacy requests

Anthony runs support and privacy requests from anthonyyoo24@gmail.com. The
Privacy Policy deletes support emails after 12 months unless a request stays
open or a legal duty requires longer retention. This procedure is prepared but
has not run in the real inbox. Before it counts as passed, Anthony confirms who
monitors the inbox and runs it once
([#96](https://github.com/anthonyyoo24/justgo/issues/96)). Agents do not open the
inbox, delete messages, send email or automate this procedure without his
instruction.

## Each request

1. Record the request date, type, applicable deadline and status in a restricted
   support record. Assess the deadline that applies; do not promise one worldwide
   period. Keep journal text and authentication or recovery secrets out of the
   record.
2. Point users to Settings for Download my data, Delete all my data and Delete
   account where those cover the request.
3. For manual help, verify account authority through an authenticated route. An
   account identifier alone does not verify a requester. Never ask for a
   recovery key or session secret by email. If the existing authenticated
   controls cannot verify a request, set up a secure authenticated route before
   acting. The implementation owner builds and verifies that route.
4. Requests can be narrower than account deletion: deleting some data, stopping
   optional collection or asking who received data.
5. Health details that users volunteer by email need separate handling under
   the consumer-health notes in the
   [regional assessment](../legal/RELEASE_DISCLOSURES.md#regional-assessment). Do
   not ask users to attach or upload their journal as a shortcut.
6. Record the action and response, then close the request. For a legal hold or
   ongoing request, record the reason, owner and next review date, and keep the
   exception only while it is needed.

## Monthly inbox review

Delete support messages and attachments older than 12 months unless an open
request or a specific legal duty needs them. Remove operator-controlled copies
and check Gmail Trash expiry. Provider recovery copies follow the policy's
separate backup wording. Review each exception again at the next monthly pass.

## Regional deadlines

These periods come from the cited laws. They are not a worldwide response
promise.

- **Washington**
  ([RCW 19.373.040](https://app.leg.wa.gov/RCW/default.aspx?cite=19.373.040)).
  Respond within 45 days of receipt. Authentication does not restart or extend
  that clock. One extension of up to 45 more days is allowed with notice inside
  the first period. Give written reasons for a refusal. Accept appeals at the same
  inbox under the subject "Privacy appeal", decide them within 45 days, and
  include the [Attorney General complaint route](https://www.atg.wa.gov/file-complaint)
  in a denial. Keep the provider deletion and expiry record with the request,
  without copying journal text into the support log.
- **Nevada** ([NRS 603A.510–.520](https://www.leg.state.nv.us/NRS/NRS-603A.html)).
  Track active deletion within 30 days of authentication, separately from the
  general deadline. Follow the statute for responses and appeals, and give the
  [Nevada Attorney General contact](https://ag.nv.gov/Contact/Contact/) after a
  denied appeal. Where Washington also applies, its six-month backup limit wins
  over Nevada's longer permitted delay.

## Error-report requests

Sentry reports carry no account identifiers, so account deletion cannot find
them. Ask for the event ID or time and technical details, and verify the
requester's authority. Sentry deletes a whole issue, not one event, and its
backups expire on their own schedule (see the
[Sentry diagnostic boundary](../legal/DATA_INVENTORY.md#sentry-diagnostic-boundary)).
Do not add an account identifier to reports to make lookup possible. Do not
promise account-linked or immediate backup erasure.
