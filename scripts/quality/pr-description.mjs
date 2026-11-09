import { pathToFileURL } from 'node:url';

export const requiredSections = ['Why', 'Scope', 'Verification'];
const order = [
  'Why',
  'What changed',
  'Scope',
  'Tradeoffs',
  'Blast Radius',
  'Verification',
];
export const guide =
  'pstack PR sections, in order: ## Why, ## What changed (optional), ## Scope, ## Tradeoffs (optional), ## Blast Radius (optional), ## Verification.';

function sections(body) {
  const found = [];
  let fence;
  for (const line of body.replace(/\r\n/g, '\n').split('\n')) {
    const [, marker, rest = ''] = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/) ?? [];
    const closes = fence && marker?.startsWith(fence) && !rest.trim();
    if (marker && (!fence || closes)) {
      fence = fence ? undefined : marker;
      if (found.length) found.at(-1).text += `${line}\n`;
      continue;
    }
    const heading = fence ? undefined : line.match(/^## (.+?)\s*$/);
    if (heading) found.push({ name: heading[1], text: '' });
    else if (found.length) found.at(-1).text += `${line}\n`;
  }
  return found;
}

export function descriptionProblems(body = '') {
  const found = sections(body);
  const names = found.map((section) => section.name);
  const problems = requiredSections
    .filter((name) => !names.includes(name))
    .map((name) => {
      const near = names.find((other) =>
        other.toLowerCase().startsWith(name.toLowerCase()),
      );
      return near
        ? `Rename "## ${near}" to "## ${name}".`
        : `Add a "## ${name}" section.`;
    });
  for (const section of found)
    if (requiredSections.includes(section.name) && !section.text.trim())
      problems.push(`Fill in the "## ${section.name}" section.`);
  const known = names.filter((name) => order.includes(name));
  const sorted = [...known].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  if (known.join() !== sorted.join())
    problems.push(`Reorder the sections to: ${sorted.join(', ')}.`);
  return problems;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const problems = descriptionProblems(process.env.PR_BODY);
  if (problems.length) {
    console.error(
      `The pull request description is missing pstack sections.\n- ${problems.join('\n- ')}\n${guide}`,
    );
    process.exitCode = 1;
  }
}
