# Nightly agent-fix routine

A claude.ai cloud routine works through open `agent-fix` issues every night. The
labeling rules are under "Where facts live" in [AGENTS.md](../../AGENTS.md). The
routine lives in Anthony's claude.ai account, not in this repository, so this doc
records its settings so that review can catch drift.

## Settings

- **Name:** "JustGO nightly agent-fix". Manage it at
  `https://claude.ai/code/routines/trig_01ThN5gi4EiYaPUHD4676SvD`.
- **Schedule:** cron `0 6 * * *` in UTC, which is 1 am Eastern Standard Time
  (2 am during daylight time).
- **Model:** Opus, on the claude.ai Default cloud environment.
- **Source:** `https://github.com/anthonyyoo24/justgo`.
- **Tools:** Bash, Read, Write, Edit, Glob, Grep and Agent.
- **Prerequisite:** GitHub connected to the Claude account
  (`https://claude.ai/connect-github`). Without it, creating the routine fails with
  `github_token_missing`.
- **Connectors:** none. Unless a create or update call sends
  `clear_mcp_connections: true`, the account's connectors are attached on their
  own, and an unattended run can then use tools such as social posting. Confirm the
  connector list before creating or changing the routine. On 2026-11-06, at Anthony's go, the
  routine was updated with `clear_mcp_connections: true`, so it has no connectors.

## What each run does

1. Lists open `agent-fix` issues, oldest first. It skips an issue that already
   has an open PR or that also carries `needs-decision` or `blocked`.
2. Checks that each issue has a reproducing failing test and needs no change to
   what users see. If not, it relabels the issue `needs-decision` or comments why.
3. Has one builder subagent open a small PR, then a separate verifier subagent post
   a verdict on that PR's base and head. A fix in a sensitive area also gets two
   adversarial reviewers before the PR opens.
4. Stops when the queue is empty, after 2 issues in a row without a passing
   verdict, or after 10 issues.
5. Reports a check it cannot run in the cloud, such as `test:db` without
   PostgreSQL, as Inconclusive in the PR. It never uses hosted databases, deploys
   or contacts providers.

## Trial: no merging

Until Anthony ends the trial, the routine merges nothing and arms no auto-merge.
Every PR waits for him. The routine prompt says this and overrides the
[merge rules](../../AGENTS.md#git-and-autonomy) during the trial. A change to the
prompt or to these settings also updates this doc.

## Checking a run

Use the `RemoteTrigger` tool: `list_runs` for the routine's runs, then
`get_run_log` for one run's tool calls, errors and result. A fire skipped before a
session started leaves no run, so check the routine with `get` (enabled,
`next_run_at`) before concluding that it never fired.
