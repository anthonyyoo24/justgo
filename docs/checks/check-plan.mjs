// Run from the repository root: node docs/checks/check-plan.mjs
// Tests the planning artifact, not the future mobile/API application.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';

const docs = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(resolve(docs, 'IMPLEMENTATION_PLAN.html'), 'utf8');
const model = JSON.parse(
  html.match(
    /<script id="plan-model" type="application\/json">([\s\S]*?)<\/script>/,
  )[1],
);
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
new vm.Script(script); // Parse the complete shipped script, without a browser.
const labels = script.match(/const labels=(\{[^;]+\});/)[1];
const validationCode = script.slice(
  script.indexOf('function validPath('),
  script.indexOf('function apply('),
);
const context = vm.createContext({
  phases: model,
  labels: JSON.parse(labels.replace(/(\w+):/g, '"$1":').replaceAll("'", '"')),
});
vm.runInContext(validationCode, context);
const fresh = () => ({
  version: 2,
  phases: Object.fromEntries(
    model.map((p) => [
      p.id,
      {
        status: p.kind === 'later' ? 'deferred' : 'planned',
        checks: [false, false, false, false],
        handoff: '',
        notes: '',
      },
    ]),
  ),
});
const finish = (data, id) =>
  Object.assign(data.phases[id], {
    status: 'complete',
    checks: [true, true, true, true],
    handoff: `handoffs/phase-${id}-test.md`,
  });
let passed = 0;
function test(name, fn) {
  fn();
  console.log('PASS ' + name);
  passed++;
}

test('nine iOS launch phases; native timer is deferred and no longer blocks billing', () => {
  assert.equal(model.filter((p) => p.kind === 'launch').length, 9);
  assert.equal(model.filter((p) => p.kind === 'later').length, 3);
  for (const phase of model)
    for (const dep of phase.deps)
      assert.ok(
        model.findIndex((p) => p.id === dep) < model.indexOf(phase),
        `dependency must precede ${phase.id}`,
      );
  assert.deepEqual(model.find((p) => p.id === '05').deps, ['10']);
  assert.equal(model.find((p) => p.id === '05').kind, 'later');
  assert.deepEqual(model.find((p) => p.id === '08').deps, ['07']);
  assert.deepEqual(model.find((p) => p.id === '11').deps, ['10']);
  assert.deepEqual(model.find((p) => p.id === '12').deps, ['10']);
});
test('every phase contains scope, exclusions, four gates and tracking fields', () => {
  for (const p of model) {
    const card = html.match(
      new RegExp(
        `<details class="phase" id="phase-${p.id}"[\\s\\S]*?<\\/details>`,
      ),
    )[0];
    assert.equal([...card.matchAll(/data-gate=/g)].length, 4);
    for (const text of [
      'Implement',
      'Keep out of this phase',
      'Carry forward:',
      'data-status',
      'data-handoff',
      'data-notes',
    ])
      assert.ok(card.includes(text));
  }
});
test('internal HTML links target actual anchors or existing files', () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const [, href] of html.matchAll(/href="([^"]+)"/g)) {
    if (href.startsWith('#')) assert.ok(ids.includes(href.slice(1)), href);
    else if (!href.startsWith('https://'))
      assert.ok(existsSync(resolve(docs, href)), href);
  }
});
test('baseline status is valid without claiming implementation', () =>
  assert.doesNotThrow(() => context.validate(fresh())));
test('complete phase requires its four gates and handoff path', () => {
  const d = fresh();
  d.phases['01'].status = 'complete';
  assert.throws(() => context.validate(d));
  finish(d, '01');
  assert.doesNotThrow(() => context.validate(d));
  d.phases['01'].handoff = '../outside.md';
  assert.throws(() => context.validate(d));
});
test('completion requires dependencies and optional coach does not require Stripe', () => {
  const d = fresh();
  finish(d, '02');
  assert.throws(() => context.validate(d));
  finish(d, '01');
  assert.doesNotThrow(() => context.validate(d));
  for (const p of model.filter((p) => p.kind === 'launch')) finish(d, p.id);
  assert.equal(d.phases['05'].status, 'deferred');
  finish(d, '12');
  assert.doesNotThrow(() => context.validate(d));
  assert.equal(d.phases['11'].status, 'deferred');
});
test('invalid imports are rejected before application', () => {
  for (const mutate of [
    (d) => (d.version = 1),
    (d) => (d.version = 999),
    (d) => delete d.phases['04'],
    (d) => (d.phases['03'].status = 'deferred'),
    (d) => (d.phases['01'].status = 'invented'),
    (d) => (d.phases['01'].checks = [1, 1, 1, 1]),
    (d) => (d.phases['01'].notes = 'x'.repeat(6001)),
    (d) => (d.phases['01'].handoff = 'x'.repeat(221)),
  ]) {
    const d = fresh();
    mutate(d);
    assert.throws(() => context.validate(d));
  }
});
test('JSON progress round-trip preserves notes and status', () => {
  const d = fresh();
  d.phases['01'].status = 'blocked';
  d.phases['01'].notes = 'Line 1\nUnicode: café. <script>text only</script>';
  const restored = context.validate(JSON.parse(JSON.stringify(d)));
  assert.deepEqual(restored, d);
});
test('required handoff context and index cover every phase', () => {
  const template = readFileSync(resolve(docs, 'handoffs/TEMPLATE.md'), 'utf8');
  for (const section of [
    'What changed',
    'Decisions and invariants',
    'Problems encountered and fixes',
    'Verification evidence',
    'Setup, data and operations',
    'Remaining work and risks',
    'Next phase: read this first',
  ])
    assert.ok(template.includes(section));
  const index = readFileSync(resolve(docs, 'handoffs/README.md'), 'utf8');
  for (const p of model) assert.ok(index.includes(`phase-${p.id}-`));
});
test('HTML and Markdown phase titles, dependencies, gates and handoff filenames agree', () => {
  const md = readFileSync(resolve(docs, 'IMPLEMENTATION_PLAN.md'), 'utf8');
  for (const p of model) {
    const section = md
      .split(`### Phase ${p.id} — `)[1]
      .split('**Working notes / blocker:**')[0];
    assert.equal(section.split('\n')[0], p.title);
    assert.ok(
      section.includes(`**Depends on:** ${p.deps.join(', ') || 'None'}`),
    );
    assert.ok(
      section.includes(
        `**Status:** ${p.id === '01' ? 'Complete' : p.kind === 'later' ? 'Not scheduled' : 'Not started'}`,
      ),
    );
    const card = html.match(
      new RegExp(
        `<details class="phase" id="phase-${p.id}"[\\s\\S]*?<\\/details>`,
      ),
    )[0];
    const path = section.match(/\*\*Handoff file to create:\*\* `([^`]+)`/)[1];
    assert.ok(card.includes(`placeholder="${path}"`));
    const decode = (t) =>
      t
        .replaceAll('&amp;', '&')
        .replaceAll('&quot;', '"')
        .replaceAll('&#x27;', "'")
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>');
    const gates = [...section.matchAll(/^- \[[ x]\] (.+)$/gm)].map((m) => m[1]);
    const htmlGates = [
      ...card.matchAll(
        /data-gate="\d"(?: checked)? aria-label="Phase \d+: ([^"]+)"/g,
      ),
    ].map((m) => decode(m[1]));
    assert.deepEqual(htmlGates, gates);
  }
});
test('saved completion has matching HTML defaults, gates and a completed handoff', () => {
  const defaults = fresh();
  for (const p of model) {
    const card = html.match(
      new RegExp(
        `<details class="phase" id="phase-${p.id}"[\\s\\S]*?<\\/details>`,
      ),
    )[0];
    const selected = [...card.matchAll(/<option value="([^"]+)" selected>/g)];
    assert.equal(selected.length, 1, `one default status for phase ${p.id}`);
    const status = selected[0][1];
    assert.equal(
      status,
      p.id === '01' ? 'complete' : p.kind === 'later' ? 'deferred' : 'planned',
    );
    const checks = [
      ...card.matchAll(/data-gate="\d"( checked)? aria-label=/g),
    ].map((m) => Boolean(m[1]));
    const handoff =
      card
        .match(/<input data-handoff[^>]*>/)[0]
        .match(/ value="([^"]+)"/)?.[1] ?? '';
    Object.assign(defaults.phases[p.id], { status, checks, handoff });
    if (status === 'complete') {
      const evidence = readFileSync(resolve(docs, handoff), 'utf8');
      assert.ok(evidence.includes('**Status:** Complete'));
    }
  }
  assert.doesNotThrow(() => context.validate(defaults));
});
test('v2 tracker uses isolated storage and dynamic release totals', () => {
  assert.ok(script.includes("const key='justgo-implementation-plan-v2'"));
  assert.ok(script.includes('done/launch.length*100'));
  assert.ok(!script.includes("done+' / 10'"));
  assert.ok(html.includes('aria-valuemax="9"'));
  const d = fresh();
  for (const p of model.filter((p) => p.kind === 'launch')) finish(d, p.id);
  assert.doesNotThrow(() => context.validate(d));
  for (const p of model.filter((p) => p.kind === 'later'))
    assert.equal(d.phases[p.id].status, 'deferred');
});
console.log(
  `${passed} checks passed. Browser verification is recorded separately.`,
);
