# Legal document site

This static reader renders the public sections of the two documents in
[`docs/legal`](../../docs/legal/). It has no browser JavaScript, hosted fonts,
embeds, analytics or external asset requests. The build itself creates no hosting
project and publishes nothing.

The pages are hosted on the assets-only Cloudflare Worker `justgo-legal`, at
[Privacy](https://justgo-legal.anthonyyoo24.workers.dev/privacy/) and
[Terms](https://justgo-legal.anthonyyoo24.workers.dev/terms/). On November 16,
2026, Anthony chose Cloudflare Workers because Vercel Hobby allows only personal
or non-commercial use (#123). The Vercel Hobby project `justgo-legal` served the
pages from October 25 and stays up until the builds that embed its links expire. The current Terms are `2026-11-15-us-east-2` and the current
Privacy Policy is `2026-11-15-us-east-3`, the plain-language rewrite, owner-approved, effective
and published November 15, 2026. The same-day revisions drop "free beta"
from the Privacy opening and rename "Download my data" to "Export data". The Privacy Policy says the database and the server run in the United
States, names only Apple and Google and describes the other providers by role.
The [data inventory](../../docs/legal/DATA_INVENTORY.md#detail-the-public-notices-leave-out)
keeps the detail the shorter text leaves out. The Terms no longer describe a free
beta.
Public notice hosting does not close the app's external-beta provider, regional
or signed-device gates.
The paid-billing Terms candidate,
[`TERMS_BILLING_CANDIDATE.md`](../../docs/legal/TERMS_BILLING_CANDIDATE.md),
waits for Anthony's approval beside the draft. The build does not read it until
it replaces the draft, as its review note says.

Run `pnpm run build:legal` from the repository root. The ignored output lives in
`sites/legal/dist/`, with `/privacy/` and `/terms/` document pages. The base address
renders the same Privacy Policy. There is no separate Legal landing page or top
tab bar. Pages show the document text with cross-document links in the footer.
The header places the navy GO mark at the page's left edge and the JustGO name
at the right, outside the narrower reading column on wide screens. Responsive
insets keep both visible on small screens. The build copies the original
transparent mark into `dist/assets/`, so the logo loads from the same site without
an external image service. Its empty alternative text avoids repeating the
visible JustGO name for screen readers.
Approval status, internal version labels and pending effective dates stay in
the source files and build validation and do not appear in the reader.
For local preview, serve that output directory with a static HTTP server. The
repository's app and API servers and the app's legal-link environment are
independent.

For physical-phone testing, serve **only `sites/legal/dist/`** on the Mac's private
LAN address and keep the phone on the same network. For example, with the Mac at
`192.168.1.10`:

```sh
python3 -m http.server 8095 --bind 192.168.1.10 --directory sites/legal/dist
```

Set `EXPO_PUBLIC_PRIVACY_POLICY_URL=http://192.168.1.10:8095/privacy/` and
`EXPO_PUBLIC_TERMS_URL=http://192.168.1.10:8095/terms/` in the ignored mobile
`.env.local`, then restart Metro with `--clear`. Explicit HTTP reader URLs work
only in development on private IPv4 or loopback hosts, with no credentials, query
or fragment. Release builds still require HTTPS. Keep the configured account API
unchanged. The legal reader is independent of account APIs and records no
document views or agreement actions.
This setup is a local preview, not public hosting, and it needs the Mac's server
running.
Update these local URLs if the Mac's LAN address changes.

Each source document must provide these metadata comments outside exactly one
`<!-- public:start -->` / `<!-- public:end -->` block:

```markdown
<!-- legal-version: privacy-next-candidate -->
<!-- publication-status: owner-review-required -->
<!-- effective-date: pending -->
```

Only the public block renders. Internal review notes and source metadata remain
outside the output. Versions are bounded document labels, independent of accounts
or per-user tracking. The two documents can use different labels. Public
content supports headings, paragraphs, flat lists, bold text and links to HTTPS,
email, or the two legal routes. Unsupported links or review placeholders fail the
build. Raw HTML is escaped.

`pnpm run build:legal --production` (also `NODE_ENV=production`) refuses to build
until both sources explicitly record `publication-status: owner-approved` and a
valid ISO effective date. Record approval only when the owner actually approves
the text. Set the effective date when publication is ready and the checklist in
[`APPROVALS.md`](../../docs/legal/APPROVALS.md#recording-an-approval) is satisfied. A successful
production build still grants no hosting, Git or publication authorization.

## Publishing updates

Publish only with Anthony's go, recorded in
[`APPROVALS.md`](../../docs/legal/APPROVALS.md). `wrangler.json` defines an
assets-only Worker with no script, no bindings, invocation logs off, the
`workers.dev` route on and preview URLs off. `force-trailing-slash` keeps
`/privacy/` and `/terms/` as stable destinations. The Worker lives on the same
personal Cloudflare account as the R2 backups, whose terms are recorded in the
[data inventory](../../docs/legal/DATA_INVENTORY.md#provider-agreements).

Its build runs `cloudflare.mjs`, which builds in production mode and also
requires the `deployment-host: cloudflare` marker in the Privacy source. Run
Wrangler from this folder, because the build command runs in the current
directory, and turn its usage metrics off:

```sh
cd sites/legal
WRANGLER_SEND_METRICS=false pnpm exec wrangler deploy --dry-run --outdir "$TMPDIR/legal-dry"
WRANGLER_SEND_METRICS=false pnpm exec wrangler deploy
```

The dry run must read exactly 8 entries from `dist`: `index.html`,
`privacy/index.html`, `terms/index.html`, `styles.css`,
`assets/justgo-mark.png` and the folders `assets`, `privacy` and `terms`. Stop
on any other file. Never upload the source repository, review records or
environment files. `wrangler login` is Anthony's sign-in.

After an authorized deploy, verify both stable HTTPS routes and the root Privacy
page anonymously against the built bytes, the original logo bytes and footer
navigation. Then set `EXPO_PUBLIC_PRIVACY_POLICY_URL` and
`EXPO_PUBLIC_TERMS_URL` in the EAS `development` and `preview` environments and
the App Store Connect Privacy Policy URL to the published destinations. Opening
and accessibility on the actual signed iPhone remain Phase 14 acceptance.

Git history keeps the Vercel publishing procedure. Retire the Vercel project
`justgo-legal` only with Anthony's go, once no installed build embeds its links.
