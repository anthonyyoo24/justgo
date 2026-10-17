import { readFileSync } from 'node:fs';

export const workflow = readFileSync(
  new URL('../../.github/workflows/ci.yml', import.meta.url),
  'utf8',
);
export const jobs = Object.fromEntries(
  workflow
    .split(/^jobs:$/m)[1]
    .split(/^ {2}(?=[\w-]+:$)/m)
    .slice(1)
    .map((job) => [job.slice(0, job.indexOf(':')), job]),
);
export const steps = (job) => job.split(/^ {6}- /m).slice(1);
export const property = (step, name) =>
  step?.match(new RegExp(`^        ${name}: (.+)$`, 'm'))?.[1];
export const commands = (job) =>
  [...job.matchAll(/^ {6}(?:- | {2})run: (.+)$/gm)].map((match) => match[1]);
export const rootPackage = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url)),
);
