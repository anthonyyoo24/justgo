# Local legal site

This static reader renders the public sections of the two documents in
[`docs/legal`](../../docs/legal/). It has no browser JavaScript, hosted fonts,
embeds, analytics or external asset requests. It creates no hosting project and
publishes nothing.

Run `npm run build:legal` from the repository root. The ignored output lives in
`sites/legal/dist/`, with `/privacy/` and `/terms/` document pages. The base address
renders the same Privacy Policy; there is no separate Legal landing page or top
tab bar. Pages show the document text with cross-document links in the footer.
The header pairs the existing navy GO mark with the JustGO name. The build copies
the original transparent mark into `dist/assets/`, so the logo loads from the
same site without an external image service. Its empty alternative text avoids
repeating the adjacent JustGO name for screen readers.
Approval status, internal version labels and pending effective dates remain in
the source files and build validation, without appearing in the reader.
The site remains local and unpublished until hosting is authorized.
For local preview, serve that output directory with a static HTTP server. The
repository's app/API servers and app legal-link environment are independent.

For physical-phone testing, serve **only `sites/legal/dist/`** on the Mac's private
LAN address and keep the phone on the same network. For example, with the Mac at
`192.168.1.10`:

```sh
python3 -m http.server 8095 --bind 192.168.1.10 --directory sites/legal/dist
```

Set `EXPO_PUBLIC_PRIVACY_POLICY_URL=http://192.168.1.10:8095/privacy/` and
`EXPO_PUBLIC_TERMS_URL=http://192.168.1.10:8095/terms/` in the ignored mobile
`.env.local`, then restart Metro with `--clear`. Explicit HTTP reader URLs work
only in development on private IPv4/loopback hosts, with no credentials, query or
fragment. Release builds still require HTTPS. Keep the configured account API
unchanged; the legal reader is independent of account APIs and records no document
views or agreement actions.
This is a local preview, not public hosting, and it needs the Mac's server running.
Update these local URLs if the Mac's LAN address changes.

Each source document must provide these metadata comments outside exactly one
`<!-- public:start -->` / `<!-- public:end -->` block:

```markdown
<!-- legal-version: 2026-10-25-managed-sync-candidate -->
<!-- publication-status: owner-review-required -->
<!-- effective-date: pending -->
```

Only the public block renders. Internal review notes and source metadata remain
outside the output. Versions are bounded document labels, independent of accounts
or per-user tracking; the two documents can use different labels. Public
content supports headings, paragraphs, flat lists, bold text and links to HTTPS,
email, or the two legal routes; unsupported links or review placeholders fail the
build. Raw HTML is escaped.

`npm run build:legal -- --production` (also `NODE_ENV=production`) refuses to build
until both sources explicitly record `publication-status: owner-approved` and a
valid ISO effective date. Record approval only when the owner actually approves
the text; set the effective date when publication is ready and the checklist in
[`LEGAL_REVIEW.md`](../../docs/legal/LEGAL_REVIEW.md) is satisfied. A successful
production build still grants no hosting, Git or publication authorization.

Anthony selected Vercel with its generated `.vercel.app` address and chose to
keep the website local until closer to launch. The October 25 managed-sync
candidates include optional accounts, signed-in journal sync and private CloudKit.
They supersede the earlier approved text and require new owner review before
publication. No custom domain is needed now. The actual project
URL and effective date/version finalization remain pending. Resume hosting setup,
publication and anonymous HTTPS/link checks in Phase 14 preparation when he is
ready; no paid upgrade is authorized now. Keep the API's protected previews and
guarded development draft routes unchanged.
