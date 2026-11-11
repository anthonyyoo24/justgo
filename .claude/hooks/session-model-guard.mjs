import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// PreToolUse hook on the app's start_session and set_session_model tools. An
// agent never picks a session's model: a session inherits its parent's model,
// and Anthony sets another one himself in the app. On 2026-11-08 a Sonnet
// session's verifiers ran on Sonnet despite verifier-model.mjs, most likely
// because a Sonnet parent cannot run an Opus helper (unconfirmed).
// start_session passes when it sets no model, including a proposal_id-only
// call, which starts an existing card as proposed. set_session_model always
// sets one, so every call is denied.
// A start on an SSH host must name `cwd` inside the JustGO checkout there.
// On 2026-11-11 two Mac mini sessions started in the home folder, so JustGO's
// .claude/settings.json never loaded: no hooks and no compaction window, and
// one grew to 351k tokens. The check reads the structured `cwd` field only.
// settings.json sets onFailure "block", so a hook that cannot run stops the
// call instead of letting a chosen model through.

export const sessionTool = 'mcp__ccd_session__start_session';
export const setModelTool = 'mcp__ccd_session_mgmt__set_session_model';
// The JustGO checkout on the Mac mini, the one SSH host JustGO uses.
export const remoteRepo = '/Users/anthony/Documents/apps/justgo';

const reason =
  'session-model-guard: leave `model` unset so the session inherits this ' +
  "session's model. Agents never choose a session's model. If Anthony wants " +
  'another model, he sets it himself in the app. Retry without `model`.';
const setModelReason =
  "session-model-guard: agents never change a session's model. If Anthony " +
  'wants another model for that session, he sets it himself in the app.';

const folderReason =
  'session-model-guard: a session on an SSH host must start inside the ' +
  `JustGO checkout there. Pass \`cwd: "${remoteRepo}"\` or a worktree ` +
  "inside it. Elsewhere JustGO's .claude/settings.json does not load, so its " +
  'hooks and compaction window are off.';

export function insideRemoteRepo(cwd) {
  if (typeof cwd !== 'string') return false;
  const path = cwd.replace(/\/+$/, '');
  if (path.split('/').some((part) => part === '..' || part === '.'))
    return false;
  return path === remoteRepo || path.startsWith(`${remoteRepo}/`);
}

export function decide(toolName, input) {
  if (toolName === setModelTool)
    return { permissionDecision: 'deny', reason: setModelReason };
  if (toolName !== sessionTool) return undefined;
  if (input?.model !== undefined) return { permissionDecision: 'deny', reason };
  const remote = input?.target === 'ssh' || input?.host !== undefined;
  if (remote && !insideRemoteRepo(input?.cwd))
    return { permissionDecision: 'deny', reason: folderReason };
  return undefined;
}

export function output(decision) {
  if (!decision) return undefined;
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: decision.permissionDecision,
      permissionDecisionReason: decision.reason,
    },
  };
}

function main() {
  const event = JSON.parse(readFileSync(0, 'utf8'));
  const result = output(decide(event.tool_name, event.tool_input ?? {}));
  if (result) process.stdout.write(JSON.stringify(result));
}

const self = fileURLToPath(import.meta.url);
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(self))
  main();
