import assert from 'node:assert/strict';
import test from 'node:test';
import { shellText } from '../../.claude/hooks/shell-text.mjs';

test('quoted strings become a placeholder unless they hold one plain word', () => {
  assert.equal(shellText('echo "a b" fix'), 'echo __quoted__ fix');
  assert.equal(shellText("git commit -m 'fix'"), 'git commit -m fix');
});

// #405: each `<<` once scanned to the end of the text for its closing tag.
test('shellText reads many heredoc openers in linear time', () => {
  for (const text of [
    '<<EOF\n'.repeat(40_000),
    Array.from({ length: 40_000 }, (_, n) => `<<T${n}\n`).join(''),
    '<<EOF'.repeat(40_000),
    'A\n<<A\n'.repeat(40_000),
    `${'<<EOF '.repeat(200_000)}\n`,
  ]) {
    const start = performance.now();
    shellText(text);
    assert.ok(performance.now() - start < 250, text.slice(0, 12));
  }
});

test('a heredoc ends only at a line with its whole tag', () => {
  assert.equal(
    shellText('cat <<EOFX\nx\nEOF\ncat <<A\ngit push\nA\necho y'),
    'cat <<EOFX\nx\nEOF\ncat  \necho y',
  );
  assert.equal(shellText('cat <<A <<B\na\nB\nA\nnext'), 'cat   <<B\nnext');
});

// #421: an empty heredoc closes on the next line
test('an empty heredoc does not hide the commands after it', () => {
  assert.match(
    shellText('cat <<EOF\nEOF\ngit commit -am x && git push\nEOF'),
    /git push/,
  );
});

// #422: cases for withoutHeredocs() that #420's verifier found missing.
test('a closing tag line may end in blanks', () => {
  assert.equal(
    shellText('cat <<EOF\ngit push\nEOF \t\necho y'),
    'cat  \necho y',
  );
});

test('an opener inside a heredoc body is data, not a second heredoc', () => {
  assert.equal(shellText('cat <<A\n<<B\nA\ngit push\nB'), 'cat  \ngit push\nB');
});
