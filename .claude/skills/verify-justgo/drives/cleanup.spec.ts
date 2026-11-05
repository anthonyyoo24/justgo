import { test, expect } from '../../../../e2e/support/fixtures';

// The journey fixture's teardown deletes every account the running fixture API
// registered. This case only opens that fixture against the `verify serve` API.
test('cleanup: remove fixture accounts the served instance created', async ({
  fixtureDatabase,
}) => {
  const role = await fixtureDatabase.query<{ current_user: string }>(
    'select current_user',
  );
  expect(role.rows[0]?.current_user).toBe('justgo_migrator');
});
