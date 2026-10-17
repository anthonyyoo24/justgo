# Activity data, saving and reconciliation

This is the implemented activity boundary, including the settled persistence design
formerly embedded in Phase 07's plan. [APP_SHELL.md](APP_SHELL.md) owns runtime/UI
composition; [TECH_STACK.md](TECH_STACK.md) owns technologies and database roles.
Product behavior lives in [CHALLENGES.md](../product/CHALLENGES.md) and the [PRD](../product/PRD.md).
The [handoff index](../handoffs/README.md) owns verification and open release gates.

## Public resources

All writes derive ownership from a verified bearer session. Strict Zod contracts
reject caller-selected account IDs and obsolete lifecycle/revision fields.

| Resource                                        | Contract                                                                                                                                                  |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /v1/challenges`                            | All active Level 1 challenges and venue placements, stable IDs/positions, current instruction/subtext/duration; local cycling requires no further request |
| `POST /v1/attempts`                             | Client UUID, challenge, venue, original `startedAt` and `startTimeZone`; 201 new, 200 matching replay, 409 changed reuse                                  |
| `PATCH /v1/attempts/:id`                        | `submissionId`, `expectedReflectionRevision`, nested `reflection`; canonical attempt and applied-submission acknowledgement                               |
| `GET /v1/progress/summary?timeZone=...`         | Today/zone, total reps, current/best streak and compact streak context, independent of selected month                                                     |
| `GET /v1/progress/calendar?month=YYYY-MM`       | Monthly reps, active days and date/count pairs, without account totals/streaks                                                                            |
| `GET /v1/attempts?date=...&limit=20&cursor=...` | Owner/date-filtered canonical entries, total and next cursor; limit 1–50, self-contained date/start-time/UUID cursor                                      |

Canonical attempts project `id`, `challengeId`, `venue`, `levelId`, `instruction`,
`startedAt`, `startTimeZone`, `displayTimeZone`, `activityDate` and nullable
`reflection: {feeling,text,revision}`. Instruction comes from the current linked
challenge. New records capture both their start and display zone; migrated records
retain a nullable unknown start zone and a historical display fallback.

An initial reflection contains a feeling, nonblank text or both. The five feeling
codes and 10,000-character text bound are shared contracts. Normalize blank text
consistently on phone/server. Later edits omit feeling and cannot change it,
including adding one to a text-only reflection. Text can clear only when a saved
feeling remains; text-only reflections cannot become empty/deleted entries.

An absent reflection has revision 0; its first accepted submission becomes revision 1,
and each accepted text edit increments it. PATCH checks an existing matching receipt
before expected revision, so an accepted
request with a lost response replays successfully. Changed payload reuse or a
truly stale revision conflicts. Conflict responses contain owner-scoped current
data only. An older acknowledgement cannot overwrite a newer local submission.
There is no separate reflection GET, draft/final/skip endpoint, combined Progress
endpoint or server Start/Finish/Give up protocol.

## Stable content and time attribution

The account/attempt key is `(user_id,id)`. Stable challenge, venue and Level 1
references preserve pending uploads/history; inactive referenced content remains.
A previously downloaded activity is not rejected solely because its challenge
became inactive or minor wording changed. Minor wording edits appear in history;
a substantially different activity receives a new challenge ID.

Only Completed creates a saved rep. Its UUID is generated once before the phone
write and reused through retries/restarts. Start and Give up remain memory-only.
The countdown derives from captured start + original duration, and zero waits for
an explicit outcome. Completed, reflection and upload time never move the rep to
another calendar day: new `activityDate` freezes the original start in its captured
zone. There is no saved finish timestamp, elapsed metric or server deadline.

The API bounds implausibly future starts and checks the original start against
account-owned verified coverage through the upload-eligibility reader. Current
paid admission and permission to upload a valid earlier rep are separate rules.
No online Start or arbitrary upload-age limit is required. Deliberately backdated
offline activity cannot be fully disproved; that trust limitation is accepted.
The default provider remains unavailable; actual subscription coverage integration
belongs to [Phase 07A](../implementation-plan/phase-07a-billing.md).

## Repository and storage ownership

`data/activity/` owns one repository per account, live Zustand state, versioned
schemas, persistence and upload coordination. Features consume its interface;
screens cannot mutate a competing queue. Storage, transport, clock and randomness
are controllable boundaries for tests. Credentials remain in secure identity
storage, outside this repository.

The account prefix is `justgo:v1:<accountId>`, with separate `:catalog` and
`:journal` keys. The catalog stores validated downloaded content. Venue selection
and cycling order remain memory-only. One serialized journal envelope contains
submitted display records, immutable operation payloads, version/receipt state,
change generation and bounded summary/calendar/today snapshots. Display and upload
intent therefore commit in one write; multi-key AsyncStorage writes are not treated
as a database transaction.

Live record version, phone-persisted version and server-acknowledged version remain
separate. Serialized persistence merges completion back into current live state
without erasing later submissions/acknowledgements. Acknowledged operations clear
only when their acknowledgement is committed. An unreadable pending journal is
preserved with a recovery state, never silently reset. A malformed replaceable
catalog can download again. Refresh replaces downloaded catalog content; an optional
cache-write failure cannot discard the committed journal or block already available
challenges.

Hydrate/validate the account envelope before use, while preserving any newer live
memory. Controllers reconcile when subscribing as well as on later notifications.
Account changes cancel/fence reads/uploads, hide the old views and hydrate only the
new owner. Parked memory-only work remains in its original partition while the
process survives. It never uploads using another account's session.

## Normal saving and failed device writes

Normal Completed and explicit reflection saves await device persistence before
continuing. They do not await ordinary HTTP acknowledgement. Interaction guards
and delayed accessible feedback cover an unfinished phone write; reflection input
can still accept newer text and dirty-close Save retains that newer input.

When a device write fails, discard only disposable confirmed day/calendar cache
payloads and retry the same save once. Keep catalog, summary/reconciliation state,
submitted content, pending/dependent operations and retry identities. Never clear
all AsyncStorage or delete a pending rep to make room.

If both writes fail, retain submitted content/operations in account memory. When
online, attempt the same create/PATCH against the API in dependency order and await
its bounded outcome. Confirmed cloud saving is durable, even if the phone cache
still fails; it does not establish offline availability. A fetch cannot save new
content and a timeout does not prove success. If neither path confirms saving,
allow continuation with a truthful dismissible loss-risk banner. Completed cannot
then become Give up, and repeated presses cannot create another rep.

Banner dismissal never stops recovery or reopens the warning for each new submission
in the same unresolved episode. Retry phone persistence on later explicit
submissions, foreground and sparse capped opportunities while active with endangered
content, including offline. Coalesce work through the repository and cancel account/
lifecycle timers. A recovery snapshot must cover all retained versions; saving one
entry cannot clear another's risk. Full recovery closes a visible warning and emits
one account-scoped confirmation even if dismissed earlier.

An acknowledgement-write failure retains the older durable intent for replay.
Direct cloud fallback can sequence dependent operations using authoritative server
acknowledgements while preserving those durable intents for later reconciliation.
It cannot introduce a second sender or claim restart recovery for unwritten memory.
Force termination can lose memory-only submissions and another phone cannot recover
a copy that never reached shared history.

## Ordered uploads and retry ownership

Use one account sender, one operation in flight per attempt, ordered create → first
reflection PATCH → later text PATCH. A genuinely new explicit save receives a new
submission UUID; unchanged retries retain immutable ID/input. Dependent edits bind
the expected revision after their predecessor's acknowledgement, persist that bound
payload and reuse it. Normal persisted delivery waits for a device-durable
acknowledgement before sending its dependent operation.

Transient delivery starts immediately, retries approximately two and five seconds
later, then pauses. Reconnect/restart/foreground can start a coalesced bounded cycle;
sparse due-work opportunities permit active/online recovery without another user
action. Respect cooldown and Retry-After, avoid overlapping bursts, suspend when
inactive/offline/no work and cancel timers on ownership changes. The app cannot
promise execution after termination. Independent query/mutation retries remain off.

Lost responses are unknown outcomes: replay the same attempt/submission identity.
Matching create/receipt results confirm the earlier operation without another rep
or revision increment. Overlay newer queued reflection over older canonical data.
Authentication uses serialized same-account renewal/recovery and pauses if ownership
cannot be restored. Permanent validation/ownership/revision failures stop transient
retries, preserve submitted content and expose redacted actionable recovery.

A genuinely stale reflection PATCH adopts the latest backend reflection and settles
the superseded dependency chain automatically. It is never rebased onto different
backend text or exposed as a multi-phone merge chooser. A rejected reflection
cannot remove accepted completion credit. Resolve uncertain creation outcomes by
safe replay before treating existing accepted activity as definitively rejected.

## Progress reconciliation and limited offline history

Day rows merge by attempt UUID; the latest explicitly submitted local reflection
wins until acknowledged. Summary/calendar use a canonical server baseline and
separate local-ID addition sets. A retained confirmed row is not an extra rep.
Memory-only submissions participate immediately; definitive completion rejection
removes provisional credit once while retaining content. Ordinary delays preserve
that credit, and reflection rejection cannot reduce it.

Do not install a new aggregate while relevant creates have unknown outcomes.
Drain/replay them first, capture generation when refreshing and reject a response
if new local activity arrived meanwhile. Once acknowledged, accept a fresh baseline
and remove covered additions together in the journal. Failed refresh keeps the old
baseline/additions: 10 + 1 stays 11 before upload, after acknowledgement and after
refresh. Day lookups can still merge by UUID while uploads are pending.

Summary additions affect totals; calendar additions use frozen activity dates.
Monthly reps/active days derive from known counts plus additions. Compact streak
context includes its month, the run ending immediately before it and the earlier
best run. Combine this with current-month dates; if context is unavailable, retain
verified streak figures until coherent refresh rather than inventing a result.
Responses are fenced by account, date/month, time zone and generation. Before a
confirmed older-day edit is pruned, transfer its canonical reflection into in-memory
query pages. Lower revisions cannot erase newer writing; authoritative conflict
data can replace optimistic text.

After account hydration, refresh/preload the latest summary, current month and
today's required pages in the background when online/access permits; do not prefetch
every calendar day. Persist the downloaded catalog, latest summary, current-month
counts and today's available pages only. Today's pages share date/zone/cursor/completeness metadata.
Older day details, including another day in this month, and other months require
online in-memory reads even after viewing. Available today content has no fabricated
partial-history warning. Unavailable offline requests show connection-required
state rather than fabricated zero history. An active older-day editor may retain
its own accepted input.

Account activation, foreground and day boundaries refresh date/zone coordination.
After rollover, select the new period's keys, remove obsolete confirmed snapshots
and retain pending entries on their frozen dates. Yesterday's snapshot cannot be
relabeled today. An unavailable new-period query is not a successful empty result.

## Pruning and deletion safety

Prune a full record only after its latest content is backend-confirmed, dependent
operations/required acknowledgement writes settle and current flow/today/aggregate
reconciliation no longer need it. Keep compact reconciliation metadata when needed.
Evaluate after settlement/reconciliation, leaving the flow and period rollover,
including foreground after inactive rollover. Removing an acknowledged operation
is separate from deleting its displayed record.

Never prune unuploaded, rejected-preserved or memory-only work because of age,
list size, banner dismissal or ordinary cache cleanup. Retain consistent recovery
metadata if the pruning write fails. Measure serialization/write size with realistic
queues/long reflections before changing envelope partitioning or claiming capacity.
Account deletion stops senders, drains accepted writes and removes selected-account
keys only after durable deletion confirmation; [IDENTITY.md](IDENTITY.md) owns that
separate destructive lifecycle.

## Database migration and protocol cutover

Immutable expansion/backfill migrations 0010–0012 precede registered contraction 0013. Preserve completed owner/ID/date/start sets, submitted feeling/text and positive
revisions, and inactive references. Legacy unknown start zones remain null with the
historical display fallback; never invent original zones or recalculate old dates.
Draft/skipped rows do not become submitted reflections. Preserve the owner/date/
start-time/UUID history index and foreign-key indexes. Choose the canonical current
catalog explicitly if old venue placements disagree; an arbitrary ID sort cannot
decide historical content.

Stop old writers before the final comparison, deploy API/contracts/mobile together
and retire old clients' write protocols. Contraction removes obsolete lifecycle,
queues/preferences/skips, content revisions, separate reflections and old receipts;
targeted PATCH receipts remain. Never edit applied migration history or fake fields
to satisfy old constraints. Keep a tested pre-cutover snapshot and restoration path.
The [rollout runbook](../operations/FOUNDATION.md#phase-07-coordinated-cutover-and-old-clients)
and [migration rehearsal](../operations/TESTING.md#migration-preservation-rehearsal)
own operational steps. A local pass does not establish hosted deployment or old-client
retirement.
