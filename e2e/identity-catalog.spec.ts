import type { Locator } from '@playwright/test';
import { sessionResponseSchema } from '@justgo/contracts';
import { randomUUID } from 'node:crypto';
import { test, expect } from './support/fixtures';
import { journeyApiUrl } from './support/environment';
import { leaveAccountScreens } from './support/account-navigation';

async function expectCenteredSpinner(button: Locator, label: string) {
  const spinner = button.getByRole('progressbar', {
    name: `${label} in progress`,
  });
  await expect(spinner).toBeVisible();
  await expect(button).toBeDisabled();
  await expect(button.getByText(label, { exact: true })).toHaveCount(0);
  const [buttonBox, spinnerBox] = await Promise.all([
    button.boundingBox(),
    spinner.boundingBox(),
  ]);
  expect(buttonBox).not.toBeNull();
  expect(spinnerBox).not.toBeNull();
  expect(
    Math.abs(
      spinnerBox!.x +
        spinnerBox!.width / 2 -
        (buttonBox!.x + buttonBox!.width / 2),
    ),
  ).toBeLessThan(1.5);
  expect(
    Math.abs(
      spinnerBox!.y +
        spinnerBox!.height / 2 -
        (buttonBox!.y + buttonBox!.height / 2),
    ),
  ).toBeLessThan(1.5);
}

test('a real account renews and opens its challenge catalog', async ({
  page,
  fixtureDatabase,
}) => {
  await page.goto('/recovery');
  const createdResponse = page.waitForResponse(
    (response) =>
      response.url() === `${journeyApiUrl}/v1/sessions` &&
      response.request().method() === 'POST',
  );
  await page
    .getByRole('button', { name: 'Create a private account', exact: true })
    .click();
  const created = await createdResponse;
  expect(created.ok()).toBe(true);
  const account = sessionResponseSchema.parse(await created.json());
  await expect(page.getByText('Connected', { exact: true })).toBeVisible();

  await page
    .getByRole('link', { name: 'Troubleshooting', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Troubleshooting', exact: true }),
  ).toBeVisible();
  const recoveryLink = page.getByRole('link', {
    name: 'Recover an existing account',
    exact: true,
  });
  await expect(recoveryLink).toBeEnabled();
  await expect(recoveryLink).toHaveAttribute('href', '/account/recover');
  const labels = await Promise.all(
    [
      'Refresh account',
      'Renew this session',
      'Recover an existing account',
    ].map((name) =>
      page
        .getByText(name, { exact: true })
        .filter({ visible: true })
        .boundingBox(),
    ),
  );
  for (const label of labels) expect(label).not.toBeNull();
  expect(Math.abs(labels[2]!.x - labels[0]!.x)).toBeLessThan(1);
  expect(Math.abs(labels[2]!.x - labels[1]!.x)).toBeLessThan(1);
  await recoveryLink.press('Enter');
  await expect(page.getByLabel('Recovery key', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  const renewedResponse = page.waitForResponse(
    (response) =>
      response.url() === `${journeyApiUrl}/v1/sessions` &&
      response.request().method() === 'POST',
  );
  await page
    .getByRole('button', { name: 'Renew this session', exact: true })
    .click();
  const renewed = await renewedResponse;
  expect(renewed.ok()).toBe(true);
  const renewal = sessionResponseSchema.parse(await renewed.json());
  expect(renewal.userId).toBe(account.userId);
  expect(renewal.sessionId).not.toBe(account.sessionId);

  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await leaveAccountScreens(page);
  await expect(
    page.getByText('Find a challenge', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Accept challenge', exact: true }),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Progress', exact: true }).click();
  await expect(page.getByText('Total reps', { exact: true })).toBeVisible();

  const records = await fixtureDatabase.query<{ count: string }>(
    'select count(*)::text as count from justgo.attempts where user_id=$1',
    [account.userId],
  );
  expect(records.rows[0]?.count).toBe('0');
});

test('a connected receiving phone confirms transfer, waits for approval and keeps both account histories separate', async ({
  page,
  context,
  fixtureDatabase,
}) => {
  const receiver = await context.newPage();
  try {
    const accounts = [];
    for (const phone of [page, receiver]) {
      await phone.goto('/recovery');
      const creating = phone.waitForResponse(
        (response) =>
          response.url() === `${journeyApiUrl}/v1/sessions` &&
          response.request().method() === 'POST',
      );
      await phone
        .getByRole('button', { name: 'Create a private account', exact: true })
        .click();
      accounts.push(sessionResponseSchema.parse(await (await creating).json()));
      await expect(phone.getByText('Connected', { exact: true })).toBeVisible();
    }
    const [source, originalReceiver] = accounts;
    expect(source!.userId).not.toBe(originalReceiver!.userId);
    const histories = accounts.map((account, index) => ({
      userId: account.userId,
      id: randomUUID(),
      text: `Disposable transfer history ${index + 1}`,
    }));
    for (const history of histories)
      await fixtureDatabase.query(
        `insert into justgo.attempts
        (user_id,id,venue_id,challenge_id,level_id,started_at,activity_date,legacy_display_time_zone,reflection_feeling,reflection_text,reflection_revision)
        select $1,$2,v.venue_id,c.id,c.level_id,'2024-11-03T05:30:00Z','2024-11-03','America/Toronto','a_little_better',$3,1
        from justgo.venue_cards v join justgo.challenges c on c.id=v.challenge_id order by v.position limit 1`,
        [history.userId, history.id, history.text],
      );

    await page
      .getByRole('link', { name: 'Move to another phone', exact: true })
      .click();
    await expect(
      page.getByText(/Recovery keys → Recover an existing account/),
    ).toBeVisible();
    await receiver.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(receiver).toHaveURL(/\/settings$/);
    await receiver
      .getByRole('link', { name: 'Account & recovery', exact: true })
      .click();
    await receiver
      .getByRole('link', { name: 'Recovery keys', exact: true })
      .click();
    await receiver
      .getByRole('link', { name: 'Recover an existing account', exact: true })
      .click();
    const transferButton = receiver.getByRole('button', {
      name: 'Transfer from another device',
      exact: true,
    });
    await transferButton.click();
    await expect(
      receiver.getByText(/Transfer an account from another device/),
    ).toBeVisible();
    await receiver.getByRole('button', { name: 'Cancel', exact: true }).click();
    const originalSession = await fixtureDatabase.query(
      'select revoked_at from justgo.device_sessions where id=$1 and user_id=$2',
      [originalReceiver!.sessionId, originalReceiver!.userId],
    );
    expect(originalSession.rows).toEqual([{ revoked_at: null }]);
    await expect(
      receiver.getByText(/Transfer an account from another device/),
    ).toHaveCount(0);

    const transferIds: string[] = [];
    let releaseStart!: () => void,
      enteredStart!: () => void,
      handledStart!: () => void;
    const startGate = new Promise<void>((resolve) => {
      releaseStart = resolve;
    });
    const startSeen = new Promise<void>((resolve) => {
      enteredStart = resolve;
    });
    const startHandled = new Promise<void>((resolve) => {
      handledStart = resolve;
    });
    await receiver.route(`${journeyApiUrl}/v1/transfers`, async (route) => {
      const body = JSON.parse(route.request().postData()!) as { id: string };
      transferIds.push(body.id);
      if (transferIds.length === 1) {
        enteredStart();
        await startGate;
        try {
          await route.abort('internetdisconnected');
        } finally {
          handledStart();
        }
      } else await route.continue();
    });
    await transferButton.click();
    await receiver
      .getByRole('button', { name: 'Confirm', exact: true })
      .click();
    try {
      await startSeen;
      const confirm = receiver.getByRole('button', {
        name: 'Confirm',
        exact: true,
      });
      await expectCenteredSpinner(confirm, 'Confirm');
      await expect(
        receiver.getByLabel('Recovery key', { exact: true }),
      ).toBeVisible();
      await expect(receiver.getByRole('progressbar')).toHaveCount(1);
      await expect(receiver.getByText(/Enter this transfer code/)).toHaveCount(
        0,
      );
    } finally {
      releaseStart();
      await startHandled;
    }
    await expect(
      receiver.getByText(/Couldn’t connect/).filter({ visible: true }),
    ).toBeVisible();
    await receiver
      .getByRole('button', { name: 'Retry connection', exact: true })
      .filter({ visible: true })
      .click();
    const code = receiver
      .getByText(/^[A-F0-9]{4}(?:-[A-F0-9]{4}){3}$/)
      .filter({ visible: true });
    const digits = receiver.getByText(/^\d{6}$/).filter({ visible: true });
    await expect(code).toBeVisible();
    await expect(digits).toBeVisible();
    expect(transferIds).toHaveLength(2);
    expect(transferIds[1]).toBe(transferIds[0]);
    await receiver
      .getByRole('button', { name: 'Check approval & finish', exact: true })
      .filter({ visible: true })
      .click();
    await expect(
      receiver.getByText(/Waiting for approval/).filter({ visible: true }),
    ).toBeVisible();
    await page
      .getByLabel('Transfer code', { exact: true })
      .fill(await code.innerText());
    let releaseInspection!: () => void,
      enteredInspection!: () => void,
      handledInspection!: () => void;
    const inspectionGate = new Promise<void>((resolve) => {
      releaseInspection = resolve;
    });
    const inspectionSeen = new Promise<void>((resolve) => {
      enteredInspection = resolve;
    });
    const inspectionHandled = new Promise<void>((resolve) => {
      handledInspection = resolve;
    });
    await page.route(
      `${journeyApiUrl}/v1/transfer-inspections`,
      async (route) => {
        enteredInspection();
        await inspectionGate;
        try {
          await route.continue();
        } finally {
          handledInspection();
        }
      },
    );
    const reviewButton = page.getByRole('button', {
      name: 'Review transfer',
      exact: true,
    });
    await reviewButton.click();
    try {
      await inspectionSeen;
      await expectCenteredSpinner(reviewButton, 'Review transfer');
    } finally {
      releaseInspection();
      await inspectionHandled;
    }

    await page
      .getByLabel('Verification digits', { exact: true })
      .fill(await digits.innerText());
    await page
      .getByRole('button', { name: 'Approve this device', exact: true })
      .click();
    await expect(page.getByText(/Transfer approved/)).toBeVisible();
    const finishing = receiver.waitForResponse(
      (response) =>
        response.url() === `${journeyApiUrl}/v1/sessions` &&
        response.request().method() === 'POST',
    );
    await receiver
      .getByRole('button', { name: 'Check approval & finish', exact: true })
      .filter({ visible: true })
      .click();
    const recovered = sessionResponseSchema.parse(
      await (await finishing).json(),
    );
    expect(recovered.userId).toBe(source!.userId);
    expect(recovered.deviceId).not.toBe(source!.deviceId);
    await expect(receiver).toHaveURL(/\/recovery$/);
    await expect(
      receiver
        .getByText('Connected', { exact: true })
        .filter({ visible: true }),
    ).toBeVisible();
    for (const history of histories) {
      const saved = await fixtureDatabase.query(
        'select id,reflection_text from justgo.attempts where user_id=$1',
        [history.userId],
      );
      expect(saved.rows).toEqual([
        { id: history.id, reflection_text: history.text },
      ]);
    }
  } finally {
    await receiver.close();
  }
});

test('leaving receiving transfer cancels its code and returns to the normal connected account hub', async ({
  page,
  fixtureDatabase,
}) => {
  const createdTransfers: string[] = [];
  try {
    await page.goto('/recovery');
    const creating = page.waitForResponse(
      (r) =>
        r.url() === `${journeyApiUrl}/v1/sessions` &&
        r.request().method() === 'POST',
    );
    await page
      .getByRole('button', { name: 'Create a private account', exact: true })
      .click();
    const original = sessionResponseSchema.parse(await (await creating).json());
    await expect(page.getByText('Connected', { exact: true })).toBeVisible();
    const openReceiver = async () => {
      await page
        .getByRole('link', { name: 'Recovery keys', exact: true })
        .click();
      await page
        .getByRole('link', { name: 'Recover an existing account', exact: true })
        .click();
    };
    const start = async () => {
      await page
        .getByRole('button', {
          name: 'Transfer from another device',
          exact: true,
        })
        .click();
      const starting = page.waitForResponse(
        (r) =>
          r.url() === `${journeyApiUrl}/v1/transfers` &&
          r.request().method() === 'POST',
      );
      await page.getByRole('button', { name: 'Confirm', exact: true }).click();
      const id = ((await (await starting).json()) as { id: string }).id;
      createdTransfers.push(id);
      await expect(
        page.getByText(/^\d{6}$/).filter({ visible: true }),
      ).toBeVisible();
      return id;
    };
    await openReceiver();
    const abandonedId = await start();
    const cancelling = page.waitForResponse(
      (r) =>
        r.url() === `${journeyApiUrl}/v1/transfers/${abandonedId}` &&
        r.request().method() === 'DELETE',
    );
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    const cancelled = await cancelling;
    expect(cancelled.status()).toBe(200);
    expect(await cancelled.json()).toEqual({ status: 'cancelled' });
    await expect(page).toHaveURL(/\/recovery$/);
    await expect(
      page.getByRole('link', { name: 'Move to another phone', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(/^\d{6}$/).filter({ visible: true }),
    ).toHaveCount(0);
    const rows = await fixtureDatabase.query(
      'select cancelled_at,redeemed_at from justgo.device_transfers where id=$1',
      [abandonedId],
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].cancelled_at).not.toBeNull();
    expect(rows.rows[0].redeemed_at).toBeNull();
    const sessions = await fixtureDatabase.query(
      'select revoked_at from justgo.device_sessions where id=$1 and user_id=$2',
      [original.sessionId, original.userId],
    );
    expect(sessions.rows).toEqual([{ revoked_at: null }]);
    await openReceiver();
    await expect(
      page.getByText(/^\d{6}$/).filter({ visible: true }),
    ).toHaveCount(0);
    const nextId = await start();
    expect(nextId).not.toBe(abandonedId);
    const nextCancellation = page.waitForResponse(
      (r) =>
        r.url() === `${journeyApiUrl}/v1/transfers/${nextId}` &&
        r.request().method() === 'DELETE',
    );
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    expect((await nextCancellation).status()).toBe(200);
  } finally {
    for (const id of createdTransfers)
      await fixtureDatabase.query(
        'delete from justgo.device_transfers where id=$1 and user_id is null',
        [id],
      );
  }
});
