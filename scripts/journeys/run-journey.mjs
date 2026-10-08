import { runJourney } from './journey-command.mjs';

process.exitCode = await runJourney({ args: process.argv.slice(2) });
