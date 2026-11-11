import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import yaml from 'js-yaml';

const config = yaml.load(
  readFileSync(new URL('../../.coderabbit.yaml', import.meta.url), 'utf8'),
);

test('CodeRabbit docstring coverage is not a pre-merge check', () => {
  assert.equal(
    config?.reviews?.pre_merge_checks?.docstrings?.mode,
    'off',
    "set reviews.pre_merge_checks.docstrings.mode: 'off' in .coderabbit.yaml",
  );
});
