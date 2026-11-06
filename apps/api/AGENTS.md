The API `test` script skips database cases. To run one, start the local database (`npm run db:local`) and run this from `apps/api`:

```sh
node --env-file-if-exists=.env ../../node_modules/vitest/vitest.mjs run tests/<area>/<file>.integration.test.ts -t '<name>'
```

[Foundation's local database section](../../docs/operations/FOUNDATION.md#local-test-database) lists the environment it needs.
