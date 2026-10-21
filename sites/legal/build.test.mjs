import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parseDocument, renderMarkdown, renderSite } from './build.mjs';

const version = 'privacy-preview-v1';
const termsVersion = 'terms-preview-v2';
const source = ({
  title = 'Privacy Policy',
  body = 'Saved information stays private.',
  legalVersion = version,
  status = 'owner-review-required',
  effectiveDate = 'pending',
} = {}) => `# Internal review document
<!-- legal-version: ${legalVersion} -->
<!-- publication-status: ${status} -->
<!-- effective-date: ${effectiveDate} -->
Private reviewer notes must never be published.
<!-- public:start -->
# ${title}

${body}
<!-- public:end -->
More private review instructions.
`;

function sources() {
  return {
    privacySource: source(),
    termsSource: source({
      title: 'Terms of Use',
      legalVersion: termsVersion,
      body: 'Read our [Privacy Policy](PRIVACY_POLICY_DRAFT.md).',
    }),
  };
}

test('extracts only the public block and treats its version as an independent document label', () => {
  const document = parseDocument(source());
  assert.equal(document.version, version);
  assert.equal(document.status, 'owner-review-required');
  assert.equal(document.effectiveDate, 'pending');
  assert.match(document.html, /<h1>Privacy Policy<\/h1>/);
  assert.doesNotMatch(
    document.html,
    /Internal review|reviewer notes|instructions/,
  );
  assert.equal(
    parseDocument(source({ legalVersion: 'another-document-v4' })).version,
    'another-document-v4',
  );
  for (const legalVersion of ['', 'x'.repeat(81), 'not a label', '<script>'])
    assert.throws(() => parseDocument(source({ legalVersion })));
});

test('rejects missing, duplicate and reversed public blocks or ambiguous metadata', () => {
  const valid = source();
  for (const invalid of [
    valid.replace('<!-- public:start -->', ''),
    valid.replace('<!-- public:end -->', ''),
    valid + '<!-- public:start -->',
    valid + '<!-- public:end -->',
    '<!-- public:end -->' + valid,
    valid.replace('<!-- public:start -->', '<!-- public:end -->'),
  ])
    assert.throws(() => parseDocument(invalid), /public content block/);
  assert.throws(
    () => parseDocument(valid + `<!-- legal-version: ${version} -->`),
    /Exactly one legal-version/,
  );
  assert.throws(
    () => parseDocument(valid.replace('publication-status:', 'status:')),
    /Exactly one publication-status/,
  );
});

test('rejects empty public sections, review notes, placeholders and extra titles', () => {
  for (const body of [
    '[REVIEW: settle this]',
    '[Set when published]',
    'TODO: decide this',
    '<!-- internal review -->',
  ])
    assert.throws(
      () => parseDocument(source({ body })),
      /exclude review notes and placeholders/,
    );
  assert.throws(
    () => parseDocument(source({ body: '# Another title' })),
    /exactly one document title/,
  );
  assert.throws(
    () => parseDocument(source().replace('# Privacy Policy', '')),
    /exactly one document title/,
  );
  assert.throws(
    () => parseDocument(source({ status: 'ready' })),
    /Unrecognized legal publication status/,
  );
});

test('escapes raw HTML and renders only supported safe inline links and bold text', () => {
  const html = renderMarkdown(
    '# A & B\n\n<script>alert("x")</script> and **private** information.\n\n[Policy](/privacy/) and [Apple](https://www.apple.com/legal/) and [Email](mailto:privacy@example.test).',
  );
  assert.match(html, /<h1>A &amp; B<\/h1>/);
  assert.match(html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
  assert.match(html, /<strong>private<\/strong>/);
  assert.match(html, /href="\/privacy\/"/);
  assert.match(html, /href="https:\/\/www.apple.com\/legal\/"/);
  assert.match(html, /href="mailto:privacy@example.test"/);
  assert.doesNotMatch(html, /<script>/);
  for (const destination of [
    'javascript:alert(1)',
    'data:text/html,hello',
    'http://example.test',
    '//example.test',
    'https://user:secret@example.test',
    'DATA_INVENTORY.md',
    'file:///private/content',
    'mailto:privacy@example.test?body=secret',
  ])
    assert.throws(
      () => renderMarkdown(`[Unsafe](${destination})`),
      /Unsupported public legal link/,
    );
});

test('renders paragraphs, headings and flat lists without accepting unsupported Markdown', () => {
  const html = renderMarkdown(
    '# Document\n\nFirst line\nsecond line.\n\n## Choices\n\n- First\n- Second\n\n### Steps\n\n1. Open\n2. Save',
  );
  assert.match(html, /<p>First line second line\.<\/p>/);
  assert.match(html, /<ul>\n<li>First<\/li>\n<li>Second<\/li>\n<\/ul>/);
  assert.match(html, /<ol>\n<li>Open<\/li>\n<li>Save<\/li>\n<\/ol>/);
  for (const body of [
    '#### Too deep',
    '```js',
    '| Table |',
    '> Quote',
    '  - Nested',
  ])
    assert.throws(() => renderMarkdown(body), /Unsupported Markdown/);
});

test('fails closed for production until both source documents record actual approval and valid dates', () => {
  assert.throws(
    () => renderSite({ ...sources(), production: true }),
    /requires explicit owner approval and an effective date/,
  );
  const approvedPrivacy = source({
    status: 'owner-approved',
    effectiveDate: '2026-10-18',
  });
  assert.throws(
    () =>
      renderSite({
        ...sources(),
        privacySource: approvedPrivacy,
        production: true,
      }),
    /requires explicit owner approval and an effective date/,
  );
  for (const effectiveDate of ['pending', '2026-02-30', '18 October 2026'])
    assert.throws(() =>
      parseDocument(source({ status: 'owner-approved', effectiveDate }), true),
    );
  // These are synthetic parser fixtures, not approvals of repository documents.
  const output = renderSite({
    privacySource: approvedPrivacy,
    termsSource: source({
      title: 'Terms',
      legalVersion: termsVersion,
      status: 'owner-approved',
      effectiveDate: '2026-10-18',
    }),
    production: true,
  });
  for (const html of output.values()) {
    assert.doesNotMatch(
      html,
      /Owner review candidate|Text approved|noindex,nofollow/,
    );
    assert.match(html, /<html lang="en">/);
  }
});

test('generates only Privacy and Terms documents, with Privacy at the base address and no landing page or top tabs', () => {
  const output = renderSite(sources());
  assert.deepEqual(
    [...output.keys()],
    ['index.html', 'privacy/index.html', 'terms/index.html'],
  );
  const destinations = new Set([
    '/privacy/',
    '/terms/',
    '/styles.css',
    '#content',
  ]);
  assert.equal(output.get('index.html'), output.get('privacy/index.html'));
  assert.equal(new Set(output.values()).size, 2);
  for (const html of output.values()) {
    assert.match(html, /noindex,nofollow/);
    assert.match(html, /Skip to content/);
    assert.match(html, /<main id="content" tabindex="-1">/);
    assert.doesNotMatch(
      html,
      /<script|<iframe|<img|<form|src="https?:|JustGO legal documents|For support or privacy questions|class="document-links"/i,
    );
    const header = /<header\b[^>]*>([\s\S]*?)<\/header>/.exec(html)?.[1];
    assert.ok(header);
    assert.match(header, /JustGO/);
    assert.doesNotMatch(header, /<nav|<a\b/);
    for (const [, href] of html.matchAll(/href="([^"]+)"/g))
      assert.ok(destinations.has(href), `Unexpected destination: ${href}`);
  }
  assert.match(output.get('privacy/index.html'), /<h1>Privacy Policy<\/h1>/);
  assert.match(output.get('terms/index.html'), /<h1>Terms of Use<\/h1>/);
  assert.match(output.get('terms/index.html'), /href="\/privacy\/"/);
});

test('keeps review status, version labels and effective-date metadata out of rendered pages while retaining publication checks', () => {
  const approvedPrivacy = source({ status: 'owner-approved' });
  const approvedTerms = source({
    title: 'Terms of Use',
    legalVersion: termsVersion,
    status: 'owner-approved',
  });
  const approvedSources = {
    privacySource: approvedPrivacy,
    termsSource: approvedTerms,
  };
  const output = renderSite(approvedSources);
  const mixed = renderSite({ ...sources(), privacySource: approvedPrivacy });
  for (const rendered of [output, mixed, renderSite(sources())])
    for (const html of rendered.values()) {
      assert.match(html, /noindex,nofollow/);
      assert.doesNotMatch(
        html,
        /Text approved|Local preview|Not published|Owner review candidate|awaiting review|pending owner review|Effective date|privacy-preview-v1|terms-preview-v2|review-banner|document-meta/i,
      );
    }
  assert.throws(
    () => renderSite({ ...approvedSources, production: true }),
    /requires explicit owner approval and an effective date/,
  );
});

test('repository public sources use document labels and exclude review records and per-user legal tracking claims', async () => {
  const [privacySource, termsSource] = await Promise.all([
    readFile(
      new URL('../../docs/legal/PRIVACY_POLICY_DRAFT.md', import.meta.url),
      'utf8',
    ),
    readFile(
      new URL('../../docs/legal/TERMS_DRAFT.md', import.meta.url),
      'utf8',
    ),
  ]);
  const output = renderSite({ privacySource, termsSource });
  const readerSource = await readFile(
    new URL('./build.mjs', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(
    readerSource,
    /packages\/contracts|CURRENT_ACCEPTANCE|analyticsScopeVersion/,
  );
  for (const html of output.values())
    assert.doesNotMatch(
      html,
      /\[REVIEW|<!--|DATA_INVENTORY|LEGAL_REVIEW|public:start|acceptance record|accepted versions|account acceptance|acceptance time|launch-candidate|pending publication|Text approved|Local preview|Not published|document version|effective date appear above/i,
    );
  for (const documentSource of [privacySource, termsSource]) {
    const document = parseDocument(documentSource);
    assert.equal(document.status, 'owner-review-required');
    assert.equal(document.effectiveDate, 'pending');
    assert.equal(document.version, '2026-10-20-managed-sync-candidate');
  }
  const privacy = output.get('privacy/index.html');
  const terms = output.get('terms/index.html');
  assert.match(privacy, /does not create a JustGO server account/);
  assert.match(
    privacy,
    /feelings and reflection text synchronize with your JustGO account/,
  );
  assert.match(privacy, /Before signing in with Apple or Google, we explain/);
  assert.match(
    privacy,
    /first successful sign-in automatically adds existing phone entries/,
  );
  assert.match(privacy, /keeps the same saved journal visible and editable/);
  assert.match(privacy, /private CloudKit database/);
  assert.match(privacy, /off by default/);
  assert.match(privacy, /Each file is a snapshot/);
  assert.match(privacy, /not password protected by JustGO/);
  assert.match(privacy, /possession of a file does not authenticate you/);
  assert.match(terms, /restorable snapshot/);
  assert.match(terms, /Delete all my data/);
  assert.match(terms, /Delete account/);
  assert.doesNotMatch(
    privacy,
    /Back up journal|Restore journal|Recover earlier journal|This export cannot be restored/,
  );
  assert.match(privacy, /Sentry/);
  assert.match(
    privacy,
    /Product analytics and ordinary automatic crash reporting are disabled/,
  );
  assert.throws(
    () => renderSite({ privacySource, termsSource, production: true }),
    /requires explicit owner approval and an effective date/,
  );
});
