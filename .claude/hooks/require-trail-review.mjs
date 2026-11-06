import {
  existsSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const trailDirectory = '.local/decision-trails';

export function reviewPath(trail) {
  return trail.replace(/\.tsv$/, '.review.md');
}

function rowsOf(trail) {
  return readFileSync(trail, 'utf8')
    .split('\n')
    .slice(1)
    .filter((row) => row.trim())
    .map((row) => row.split('\t'));
}

function needsReview(trail) {
  const rows = rowsOf(trail);
  if (rows.length === 0) return false;
  if (rows.at(-1)[1] === 'waiting') return false;
  const review = reviewPath(trail);
  return (
    !existsSync(review) || statSync(review).mtimeMs < statSync(trail).mtimeMs
  );
}

const bugOutcome = /^(?:agent-fix|needs-decision|blocked|skip:\s*\S.*)$/;
const issueUrl = /github\.com\/anthonyyoo24\/justgo\/issues\/(\d+)\b/;
const issueNumber = /(?:^|[^\w&/])#(\d+)\b/;

function bugKey(evidence = '') {
  const number =
    evidence.match(issueUrl)?.[1] ?? evidence.match(issueNumber)?.[1];
  return number ? `#${number}` : evidence.trim();
}

function unlabeledBugs(trail) {
  const latest = new Map();
  for (const cells of rowsOf(trail))
    if (cells[1] === 'bug') latest.set(bugKey(cells[4]), cells);
  return [...latest.values()]
    .filter((cells) => !bugOutcome.test(cells[5]?.trim() ?? ''))
    .map((cells) => cells[4] || cells[2]);
}

const trailPath = /decision-trails\/[^\s"'`;)]+\.tsv/g;
const redirectIntoTrail =
  /(?:^|[^>&\d])>\s*["']?([^\s"'`;)]*decision-trails\/[^\s"'`;)]+\.tsv)/g;
const appendsInShell = /(>>|\btee\b|\blog\.sh\b|appendFileSync|writeFileSync)/;

export function trailsWrittenBy(transcript) {
  const written = new Set();
  for (const line of transcript.split('\n')) {
    if (!line.includes('"tool_use"') || !line.includes('decision-trails'))
      continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    for (const block of entry.message?.content ?? []) {
      if (block?.type !== 'tool_use') continue;
      const input = block.input ?? {};
      const targets =
        block.name === 'Bash'
          ? [
              ...(appendsInShell.test(input.command ?? '')
                ? (input.command.match(trailPath) ?? [])
                : []),
              ...[...(input.command ?? '').matchAll(redirectIntoTrail)].map(
                (match) => match[1],
              ),
            ]
          : ['Write', 'Edit', 'NotebookEdit'].includes(block.name)
            ? [input.file_path ?? '']
            : [];
      for (const target of targets)
        if (target.includes('decision-trails/') && target.endsWith('.tsv'))
          written.add(path.basename(target));
    }
  }
  return written;
}

function sessionTrails({ root, transcript, sessionStartMs = 0 }) {
  const directory = path.join(root, trailDirectory);
  if (!existsSync(directory)) return [];
  const written = trailsWrittenBy(transcript);
  return readdirSync(directory)
    .filter((name) => name.endsWith('.tsv') && written.has(name))
    .filter(
      (name) => statSync(path.join(directory, name)).mtimeMs >= sessionStartMs,
    )
    .map((name) => path.join(trailDirectory, name));
}

export function trailsNeedingReview(session) {
  return sessionTrails(session).filter((trail) =>
    needsReview(path.join(session.root, trail)),
  );
}

function bugsWithoutLabel(session) {
  return sessionTrails(session).flatMap((trail) =>
    unlabeledBugs(path.join(session.root, trail)).map(
      (bug) => `${trail}: ${bug}`,
    ),
  );
}

function bugBlockReason(bugs) {
  return [
    `Decision trail records a filed bug with no fix label: ${bugs.join(', ')}.`,
    'Add exactly one of agent-fix, needs-decision or blocked to each issue (`gh issue edit <number> --add-label <label>`).',
    'Then append a row whose phase is `bug`, whose evidence is the issue URL and whose result is that label.',
    'If the issue gets no label, append that row with the result `skip: <reason>`.',
    "A later row replaces an earlier one when both name the same issue as this repository's issue URL or `#N`, or, when neither names one, when both have the same evidence text.",
    'On a reviewed run the new row makes the trail newer than its review, so refresh the review afterwards, or append a `waiting` row if the run is only paused.',
  ].join(' ');
}

export function blockReason(trails) {
  const list = trails
    .map((trail) => `${trail} (review: ${reviewPath(trail)})`)
    .join(', ');
  return [
    `Decision trail has rows newer than its review: ${list}.`,
    'Finish the run with the show-me-your-work end steps before stopping.',
    "First audit this run's rows against what happened and append superseding rows for anything missing or wrong.",
    'Then spawn a separate reviewer agent (another model family; here a separate Claude agent) that reads the trail and writes its Attention list to the review file.',
    'End your reply with that Attention list.',
    'If the run is only paused, append a row whose phase is `waiting` instead.',
  ].join(' ');
}

function main() {
  const input = JSON.parse(readFileSync(0, 'utf8') || '{}');
  if (input.stop_hook_active || !input.transcript_path) return;
  if (input.background_tasks?.length || input.session_crons?.length) return;
  if (!existsSync(input.transcript_path)) return;
  const session = {
    root: process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd(),
    transcript: readFileSync(input.transcript_path, 'utf8'),
    sessionStartMs: statSync(input.transcript_path).birthtimeMs,
  };
  const trails = trailsNeedingReview(session);
  const bugs = bugsWithoutLabel(session);
  const reasons = [
    ...(trails.length ? [blockReason(trails)] : []),
    ...(bugs.length ? [bugBlockReason(bugs)] : []),
  ];
  if (reasons.length)
    process.stdout.write(
      JSON.stringify({ decision: 'block', reason: reasons.join(' ') }),
    );
}

const invoked = process.argv[1] && realpathSync(process.argv[1]);
if (invoked === realpathSync(fileURLToPath(import.meta.url))) main();
