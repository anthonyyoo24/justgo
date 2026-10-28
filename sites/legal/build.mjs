import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const siteDirectory = fileURLToPath(new URL('./', import.meta.url));
const repositoryDirectory = path.resolve(siteDirectory, '../..');
const documentRoutes = new Map([
  ['PRIVACY_POLICY_DRAFT.md', '/privacy/'],
  ['TERMS_DRAFT.md', '/terms/'],
]);

export function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[character];
  });
}

function safeHref(value) {
  if (documentRoutes.has(value)) return documentRoutes.get(value);
  if (['/', '/privacy/', '/terms/'].includes(value)) return value;
  if (/^mailto:[^\s?&#<>"']+@[^\s?&#<>"']+$/i.test(value)) return value;
  try {
    const url = new URL(value);
    if (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !/[\s<>"']/.test(value)
    )
      return url.href;
  } catch {
    // Unrecognized or relative destinations fail below rather than becoming links.
  }
  throw new Error(`Unsupported public legal link: ${value}`);
}

function renderInline(value) {
  const token = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let output = '';
  let previous = 0;
  for (const match of value.matchAll(token)) {
    output += escapeHtml(value.slice(previous, match.index));
    output += match[1]
      ? `<strong>${escapeHtml(match[1])}</strong>`
      : `<a href="${escapeHtml(safeHref(match[3]))}">${escapeHtml(match[2])}</a>`;
    previous = match.index + match[0].length;
  }
  return output + escapeHtml(value.slice(previous));
}

/** Deliberately supports only the Markdown used by the two public documents. */
export function renderMarkdown(markdown) {
  const output = [];
  let paragraph = [];
  let list = null;
  const closeParagraph = () => {
    if (paragraph.length) {
      output.push(`<p>${renderInline(paragraph.join(' '))}</p>`);
      paragraph = [];
    }
  };
  const closeList = () => {
    if (list) {
      output.push(`</${list}>`);
      list = null;
    }
  };
  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      closeParagraph();
      closeList();
      continue;
    }
    if (/^\s+[-\d]/.test(rawLine))
      throw new Error('Unsupported Markdown in public legal content');
    const heading = /^(#{1,3}) (.+)$/.exec(line);
    if (heading) {
      closeParagraph();
      closeList();
      output.push(
        `<h${heading[1].length}>${renderInline(heading[2])}</h${heading[1].length}>`,
      );
      continue;
    }
    const item = /^(- |\d+\. )(.+)$/.exec(line);
    if (item) {
      closeParagraph();
      const kind = item[1] === '- ' ? 'ul' : 'ol';
      if (list !== kind) {
        closeList();
        output.push(`<${kind}>`);
        list = kind;
      }
      output.push(`<li>${renderInline(item[2])}</li>`);
      continue;
    }
    if (/^(?:#{4,}|```|\||>)/.test(line))
      throw new Error('Unsupported Markdown in public legal content');
    closeList();
    paragraph.push(line);
  }
  closeParagraph();
  closeList();
  return output.join('\n');
}

function metadata(source, key) {
  const matches = [
    ...source.matchAll(new RegExp(`^<!-- ${key}: ([^\\r\\n]+) -->$`, 'gm')),
  ];
  if (matches.length !== 1)
    throw new Error(`Exactly one ${key} metadata field is required`);
  return matches[0][1];
}

function validDate(value) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}

export function parseDocument(source, production = false) {
  const start = '<!-- public:start -->';
  const end = '<!-- public:end -->';
  const first = source.indexOf(start);
  const last = source.indexOf(end);
  if (
    first === -1 ||
    last <= first ||
    source.indexOf(start, first + start.length) !== -1 ||
    source.indexOf(end, last + end.length) !== -1
  )
    throw new Error('Exactly one ordered public content block is required');
  const outside = source.slice(0, first) + source.slice(last + end.length);
  const version = metadata(outside, 'legal-version');
  const status = metadata(outside, 'publication-status');
  const effectiveDate = metadata(outside, 'effective-date');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(version))
    throw new Error(
      'Public legal version must be a valid bounded document label',
    );
  if (!['owner-review-required', 'owner-approved'].includes(status))
    throw new Error('Unrecognized legal publication status');
  if (effectiveDate !== 'pending' && !validDate(effectiveDate))
    throw new Error('Legal effective date must be pending or a valid ISO date');
  const markdown = source.slice(first + start.length, last).trim();
  if (
    !markdown ||
    /<!--|\[(?:REVIEW|TODO|TBD|Set\b)|\b(?:TODO|TBD)\b/i.test(markdown)
  )
    throw new Error(
      'Public legal content must exclude review notes and placeholders',
    );
  if ((markdown.match(/^# /gm) ?? []).length !== 1)
    throw new Error(
      'Public legal content must have exactly one document title',
    );
  if (production && (status !== 'owner-approved' || !validDate(effectiveDate)))
    throw new Error(
      'Publication requires explicit owner approval and an effective date',
    );
  return { html: renderMarkdown(markdown), version, status, effectiveDate };
}

function page({ title, content, production }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${production ? '' : '<meta name="robots" content="noindex,nofollow">'}
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'">
<meta name="referrer" content="no-referrer">
<title>${escapeHtml(title)} · JustGO</title>
<link rel="stylesheet" href="/styles.css">
</head>
<body>
<a class="skip-link" href="#content">Skip to content</a>
<header class="site-header"><img class="brand-mark" src="/assets/justgo-mark.png" width="425" height="234" alt=""><span class="wordmark">JustGO</span></header>
<main id="content" tabindex="-1">${content}</main>
<footer><p>JustGO</p><nav aria-label="Legal documents"><a href="/privacy/">Privacy Policy</a><a href="/terms/">Terms of Use</a></nav></footer>
</body>
</html>
`;
}

export function renderSite({ privacySource, termsSource, production = false }) {
  const privacy = parseDocument(privacySource, production);
  const terms = parseDocument(termsSource, production);
  const privacyPage = page({
    title: 'Privacy Policy',
    production,
    content: privacy.html,
  });
  return new Map([
    // The base address is an alias for Privacy, with no separate landing page.
    ['index.html', privacyPage],
    ['privacy/index.html', privacyPage],
    [
      'terms/index.html',
      page({
        title: 'Terms of Use',
        production,
        content: terms.html,
      }),
    ],
  ]);
}

export async function buildSite({
  production = false,
  outputDirectory = path.join(siteDirectory, 'dist'),
} = {}) {
  const [privacySource, termsSource, stylesheet, brandMark] = await Promise.all(
    [
      readFile(
        path.join(repositoryDirectory, 'docs/legal/PRIVACY_POLICY_DRAFT.md'),
        'utf8',
      ),
      readFile(
        path.join(repositoryDirectory, 'docs/legal/TERMS_DRAFT.md'),
        'utf8',
      ),
      readFile(path.join(siteDirectory, 'styles.css'), 'utf8'),
      readFile(
        path.join(
          repositoryDirectory,
          'apps/mobile/assets/brand/justgo-mark.png',
        ),
      ),
    ],
  );
  // Validate both source documents before replacing any previous preview output.
  const output = renderSite({ privacySource, termsSource, production });
  output.set('styles.css', stylesheet);
  output.set('assets/justgo-mark.png', brandMark);
  await rm(outputDirectory, { recursive: true, force: true });
  for (const [relativePath, contents] of output) {
    const destination = path.join(outputDirectory, relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, contents);
  }
  return outputDirectory;
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  const args = process.argv.slice(2);
  if (args.some((argument) => argument !== '--production'))
    throw new Error('Usage: node sites/legal/build.mjs [--production]');
  const directory = await buildSite({
    production:
      args.includes('--production') || process.env.NODE_ENV === 'production',
  });
  process.stdout.write(`Legal site built at ${directory}\n`);
}
