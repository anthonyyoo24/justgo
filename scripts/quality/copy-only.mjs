// Whether a patch only rewords user-facing text. The verifier-model hook and
// verify-batch.mjs let such a change to a sensitive file count as small, so a
// one-sentence copy fix runs its verifier on Sonnet. Anything this cannot read
// with confidence is not copy-only, and the file stays sensitive.
//
// A patch is copy-only when each run of changed lines, with its string
// literals replaced by a marker, reads the same before and after, and every
// string that changed reads like prose. Template literals keep their `${}`
// expressions, which must not change. Whitespace that cannot change meaning
// (indentation, a line break after an operator or before a closing bracket, a
// trailing comma) may move, so a string that gets shorter can rejoin its line.
// JSX text, comments and anything with a `/` or a backslash outside a string
// are not read, so a change to them is not copy-only.

// Only mobile TypeScript, tests included. Other sensitive files carry SQL,
// config or legal text, which needs the full review.
const copyScope = /^apps\/mobile\/src\/.+\.tsx?$/;

const marker = '\uE000';

// Splits code into its skeleton, with each string replaced by the marker, and
// the strings it holds. A template literal keeps its expressions in the
// skeleton, and its text, with `X` for each expression, joins the strings.
// Undefined when the code cannot be read with confidence.
export function splitStrings(code) {
  let skeleton = '';
  const strings = [];
  let at = 0;
  while (at < code.length) {
    const char = code[at];
    if (char === '/' || char === '\\') return undefined;
    if (char === "'" || char === '"') {
      const end = code.indexOf(char, at + 1);
      if (end === -1) return undefined;
      const text = code.slice(at + 1, end);
      if (/[\n\\]/.test(text)) return undefined;
      strings.push(text);
      skeleton += marker;
      at = end + 1;
      continue;
    }
    if (char === '`') {
      let text = '';
      skeleton += '`';
      at += 1;
      for (;;) {
        if (at >= code.length) return undefined;
        const next = code[at];
        if (next === '\\') return undefined;
        if (next === '`') break;
        if (next === '$' && code[at + 1] === '{') {
          let depth = 1;
          let end = at + 2;
          while (end < code.length && depth > 0) {
            if (/['"`/\\]/.test(code[end])) return undefined;
            if (code[end] === '{') depth += 1;
            if (code[end] === '}') depth -= 1;
            end += 1;
          }
          if (depth > 0) return undefined;
          skeleton += code.slice(at, end);
          text += 'X';
          at = end;
          continue;
        }
        text += next;
        at += 1;
      }
      if (text.includes('\n')) return undefined;
      strings.push(text);
      skeleton += '`';
      at += 1;
      continue;
    }
    skeleton += char;
    at += 1;
  }
  return { skeleton: normalize(skeleton), strings };
}

// Drops the whitespace that cannot change meaning. A line break after an
// operator or an opening bracket cannot end a statement, and one before a
// closing bracket, or a trailing comma there, changes nothing.
function normalize(skeleton) {
  return skeleton
    .replace(/^[ \t]+|[ \t]+$/gm, '')
    .replace(/,?\s*([)\]}])/g, '$1')
    .replace(/([([])\s+/g, '$1')
    .replace(/([=:,?+{]|=>|&&|\|\|)\s+/g, '$1 ')
    .replace(/[ \t]+/g, ' ');
}

// Code that compares, matches or looks up by a string, so its exact text is
// behavior, not copy: an equality check, a `case`, a string method that
// matches, a quoted object key or an index by string.
const usesTextAsData =
  /[=!]=|\bcase\b|\.(?:includes|startsWith|endsWith|indexOf|lastIndexOf|match|matchAll|replace|replaceAll|split|search|test|localeCompare)\b|\bRegExp\b|\uE000:|[\w)\]]\[\uE000/;

// SQL keywords as the mobile storage writes them, in capitals.
const sqlKeyword =
  /\b(?:SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|PRAGMA|FROM|WHERE|TABLE|INTO|VALUES|SET)\b/;

// Prose starts with a capital letter or a digit, has words separated by
// spaces, and uses only letters, digits and sentence punctuation. A URL, path,
// header, key, error code, regex or identifier fails one of these.
export function isProse(text) {
  return (
    /^[“‘"'(]?[\p{Lu}\p{N}]/u.test(text) &&
    /\S\s+\S/.test(text) &&
    /^[\p{L}\p{N} .,;:!?'’‘“”"()&%…–—-]+$/u.test(text) &&
    !/\.[\p{L}\p{N}]/u.test(text) &&
    !sqlKeyword.test(text)
  );
}

// The runs of changed lines in a unified-diff patch, as removed and added
// text. Undefined when the patch has no hunk or a line it cannot read.
export function changeRuns(patch) {
  const runs = [];
  let run;
  let hunks = 0;
  for (const line of patch.split('\n')) {
    if (line.startsWith('@@')) {
      hunks += 1;
      run = undefined;
      continue;
    }
    if (line.startsWith('\\')) continue;
    if (hunks === 0) return undefined;
    const sign = line[0];
    if (sign === '-' || sign === '+') {
      if (!run) runs.push((run = { removed: [], added: [] }));
      (sign === '-' ? run.removed : run.added).push(line.slice(1));
    } else if (sign === ' ' || line === '') run = undefined;
    else return undefined;
  }
  return hunks > 0 ? runs : undefined;
}

function copyOnlyRun({ removed, added }) {
  const before = splitStrings(removed.join('\n'));
  const after = splitStrings(added.join('\n'));
  if (!before || !after) return false;
  if (before.skeleton !== after.skeleton) return false;
  if (before.strings.length !== after.strings.length) return false;
  if (usesTextAsData.test(before.skeleton)) return false;
  if (sqlKeyword.test(before.skeleton)) return false;
  return before.strings.every(
    (text, index) =>
      text === after.strings[index] ||
      (isProse(text) && isProse(after.strings[index])),
  );
}

// Whether a file's change only rewords user-facing text. `file` is
// `{ path, patch }`, with the patch GitHub lists for it. A missing patch, as
// for a large or binary file, a rename or a file out of scope, is never
// copy-only. A hunk line with an odd number of backticks may sit inside a
// multi-line template, so the file is not copy-only either.
export function isCopyOnly(file) {
  if (!copyScope.test(file.path) || typeof file.patch !== 'string')
    return false;
  const oddBackticks = (line) => (line.match(/`/g) ?? []).length % 2 === 1;
  if (file.patch.split('\n').some(oddBackticks)) return false;
  const runs = changeRuns(file.patch);
  return Boolean(runs && runs.length > 0 && runs.every(copyOnlyRun));
}
