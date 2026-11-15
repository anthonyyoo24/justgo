// Shell text as a hook should read it: heredoc bodies and quoted strings are
// data, so separators and words inside them never start a command. sync-main
// uses it to find `git worktree add`.

const heredocOpener = /<<-?[ \t]*(['"]?)(\w+)\1/g;

// Each heredoc becomes the rest of its opener line, so its body is gone. A
// body ends at the first line after the opener's line that holds only its
// whole tag, as in the shell. That can be the very next line, which leaves the
// body empty (#421). An opener with no closing line stays text. One pass lists
// the tag lines and each tag's list is read forward, so the time is linear
// (#405).
function withoutHeredocs(text) {
  const tagLines = new Map();
  for (let start = text.indexOf('\n'); start !== -1;) {
    const next = text.indexOf('\n', start + 1);
    const end = next === -1 ? text.length : next;
    const tag = /^[ \t]*(\w+)[ \t]*$/.exec(text.slice(start + 1, end))?.[1];
    if (tag) {
      if (!tagLines.has(tag)) tagLines.set(tag, { lines: [], next: 0 });
      tagLines.get(tag).lines.push({ start, end });
    }
    start = next;
  }
  let out = '';
  let kept = 0;
  let newline = -1;
  heredocOpener.lastIndex = 0;
  for (let match; (match = heredocOpener.exec(text));) {
    // Openers come in order, so the newline after the last one is reused
    // until an opener passes it. With no newline left, no body can start.
    if (newline < match.index) newline = text.indexOf('\n', match.index);
    if (newline === -1) break;
    const closings = tagLines.get(match[2]);
    // A tag line's start is the newline before it, so the line right after
    // the opener starts at the opener's own newline and can close it.
    while (closings?.lines[closings.next]?.start < newline) closings.next += 1;
    const closing = closings?.lines[closings.next];
    if (!closing) {
      heredocOpener.lastIndex = match.index + 1;
      continue;
    }
    out += `${text.slice(kept, match.index)} ${text.slice(heredocOpener.lastIndex, newline)}`;
    kept = closing.end;
    heredocOpener.lastIndex = closing.end;
  }
  return out + text.slice(kept);
}

// Heredoc bodies and quoted strings are data, so separators and words inside
// them never start a command. A quoted plain word, such as "fix", keeps its
// text.
export function shellText(command) {
  return withoutHeredocs(command.replace(/\\\r?\n/g, ' ')).replace(
    /'[^']*'|"(?:[^"\\]|\\.)*"/g,
    (match) => {
      const inner = match.slice(1, -1);
      return /^[\w./:@~+^-]+$/.test(inner) ? inner : '__quoted__';
    },
  );
}
