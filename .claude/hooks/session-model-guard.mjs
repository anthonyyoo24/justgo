import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// PreToolUse hook on the app's start_session tool. An agent never picks the
// model of a session it starts: the session inherits the parent's model, and
// Anthony sets another one himself in the app. A Sonnet parent also keeps its
// verifiers off Opus, so one cheaper session undoes the verifier-model hook.
// A call with proposal_id alone starts an existing card as proposed and passes.
// settings.json sets onFailure "block", so a hook that cannot run stops the
// call instead of letting a chosen model through.

export const sessionTool = 'mcp__ccd_session__start_session';

const reason =
  'session-model-guard: leave `model` unset so the session inherits this ' +
  "session's model (Opus). Agents never choose a session's model. If Anthony " +
  'wants another model, he sets it himself in the app. Retry without `model`.';

export function decide(toolName, input) {
  if (toolName !== sessionTool) return undefined;
  if (input?.model === undefined) return undefined;
  return { permissionDecision: 'deny', reason };
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
