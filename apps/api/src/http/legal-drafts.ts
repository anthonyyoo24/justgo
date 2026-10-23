import type { FastifyInstance } from 'fastify';

const notice =
  '<p><strong>Development draft — not final release documents.</strong> These pages are for local document testing. Phase 12 owns legal review, effective dates and public publication. They do not publish the legal website or enable diagnostics. JustGO does not record document views or legal agreement.</p>';
const journalStorageNotice =
  '<p>Guest and signed-out journals stay on this phone unless you separately enable iCloud Sync or share a downloaded backup. When signed in, challenge history, feelings and written reflections synchronize with your JustGO account. Entries waiting to synchronize can exist only on this phone. Signing out stops JustGO account sync and keeps the same journal on this phone. Signing back into the same account can restore history and journal entries that reached that account.</p>';
const drafts = {
  terms: {
    title: 'Terms of Service',
    body:
      '<h2>Using JustGO</h2><p>JustGO helps adults aged 18 and over practice small everyday challenges and optionally save a feeling or written reflection.</p>' +
      journalStorageNotice +
      '<h2>Your account and records</h2><p>Apple or Google sign-in protects access to your JustGO account. Settings provides Download my data, Import data, optional iCloud Sync, Delete all my data and Delete account. Downloaded files do not authenticate an account. The free beta has no active in-app purchases. Billing terms and disclosures must be reviewed before purchases are enabled; deleting an account does not cancel an Apple subscription.</p><h2>Legal documents</h2><p>Reading the Terms or Privacy Policy does not create a server receipt or legal-version record. This development reference does not establish final regional terms or Apple EULA compatibility.</p>',
  },
  privacy: {
    title: 'Privacy Policy',
    body:
      '<h2>Your data is yours</h2>' +
      journalStorageNotice +
      '<p>Legacy server journal entries and their old update records were cleared by the approved reset. Accounts, challenge history and entries saved on phones were preserved. Optional iCloud Sync uses a separate private copy under your Apple account. Downloaded backups contain history and private journal content; Files lets you choose iCloud Drive or another protected destination. Each file is a snapshot and later edits require another backup. We do not sell your personal information.</p><h2>Minimal crash reporting</h2><p>When enabled, Sentry processes minimal crash reports in the United States: app and OS versions and scrubbed technical error details. Exported reports exclude your account ID, feelings, written reflections and breadcrumbs. Native crash files can temporarily contain original technical details on your phone before scrubbed delivery. Reports are not linked to your JustGO account, so deleting the account cannot identify or erase them through an account identifier.</p><p>Ordinary delivery remains disabled pending notice and provider review and signed-build verification; this draft does not resolve the applicable permission requirements.</p><h2>Product analytics is disabled</h2><p>Product analytics stays disabled through beta and paid launch. Reading legal documents does not authorize future analytics. Phase 15 must review the actual provider and fields, applicable choices and updated notices before activation. No pre-activation history may be backfilled.</p><h2>Account controls and release review</h2><p>Settings provides Apple or Google sign-in, Download my data, Import data, optional iCloud Sync, Delete all my data and Delete account independently of diagnostics or analytics. Deletion covers the selected journal’s phone, JustGO account and associated app-managed iCloud copies; cleanup stays pending when a required service is unavailable. Account-data deletion requires signing into that account. Delete all my data keeps the account and its login methods. Delete account removes the JustGO account and its associated data. User-saved backup files remain under the user’s control. iPhone system backup is separate from a downloaded Files backup. Phase 12 must finalize providers, retention, regional rights, request handling and operator details before publication. Phase 14 verifies the final signed build and release disclosures.</p>',
  },
};

export function developmentLegalDraftRoutes(app: FastifyInstance) {
  for (const [path, document] of Object.entries(drafts))
    app.get(`/legal/${path}`, async (_request, reply) =>
      reply
        .type('text/html; charset=utf-8')
        .send(
          `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${document.title} — Development draft</title></head><body><main><h1>${document.title}</h1>${notice}${document.body}</main></body></html>`,
        ),
    );
}
