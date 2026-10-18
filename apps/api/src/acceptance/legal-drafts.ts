import type { FastifyInstance } from 'fastify';

const notice =
  '<p><strong>Development draft — not final release documents.</strong> These pages are for local acceptance-flow testing. Final legal review, effective dates and public publication belong to Phase 13.</p>';
const drafts = {
  terms: {
    title: 'Terms of Service',
    body: '<h2>Using JustGO</h2><p>JustGO helps you practice small everyday challenges and optionally save a feeling or reflection. Your submitted activity is saved on your phone and uploaded to private account records for saving and recovery.</p><h2>Your account and records</h2><p>Your recovery credentials protect access to your account. Account recovery, data export and permanent account deletion remain available through Settings. Deleting an account does not cancel an Apple subscription.</p><h2>Acceptance under development</h2><p>The app records the Terms, Privacy Policy and analytics-scope versions you accepted and the server acceptance time. This draft is not approved for a release and does not establish final regional terms or Apple EULA compatibility.</p>',
  },
  privacy: {
    title: 'Privacy Policy',
    body: '<h2>Your data is yours</h2><p>Your saved activity and reflections are kept on your phone and uploaded to your private JustGO account for saving and recovery. We will not sell your data without your permission.</p><h2>App usage and the planned analytics scope</h2><p>Analytics export is disabled in this development phase. The disclosed future scope uses PostHog to understand app usage and improve JustGO. Limited usage fields may include selected feelings and approximate reflection-length categories when submitted, but never the words you wrote. A persistent random identifier can link analytics to your JustGO account; these records are pseudonymous, not anonymous.</p><h2>Account controls and release review</h2><p>Settings provides account recovery, data export and permanent deletion independently of analytics. Missing acceptance or an applicable account privacy restriction blocks analytics forwarding. Phase 13 must finalize actual transmitted fields, providers, retention, regional rights, request handling and operator details before publication.</p>',
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
