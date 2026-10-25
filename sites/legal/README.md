# Legal document site

This static reader renders the public sections of the two documents in
[`docs/legal`](../../docs/legal/). It has no browser JavaScript, hosted fonts,
embeds, analytics or external asset requests. The build itself creates no hosting
project and publishes nothing.

The October 25 owner-directed publication is live at
[Privacy](https://justgo-legal.vercel.app/privacy/) and
[Terms](https://justgo-legal.vercel.app/terms/) on the separate Vercel Hobby project
`justgo-legal`. Its source labels are `2026-10-25-beta`, owner-approved and effective
October 25, 2026. Public notice hosting does not close the app's external-beta
provider, regional or signed-device gates.

Run `npm run build:legal` from the repository root. The ignored output lives in
`sites/legal/dist/`, with `/privacy/` and `/terms/` document pages. The base address
renders the same Privacy Policy; there is no separate Legal landing page or top
tab bar. Pages show the document text with cross-document links in the footer.
The header places the navy GO mark at the page's left edge and the JustGO name
at the right, outside the narrower reading column on wide screens. Responsive
insets keep both visible on small screens. The build copies the original
transparent mark into `dist/assets/`, so the logo loads from the same site without
an external image service. Its empty alternative text avoids repeating the
visible JustGO name for screen readers.
Approval status, internal version labels and pending effective dates remain in
the source files and build validation, without appearing in the reader.
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
<!-- legal-version: privacy-next-candidate -->
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

## Publishing updates

Keep the document project independent of the API project and preserve the owner's
Git permissions. Build the approved sources in production mode, then stage only
the generated public files. The Vercel project uses framework `Other`, empty
build/install commands and output directory `.`. Set `trailingSlash: true` in the
staged `vercel.json` so `/privacy/` and `/terms/` remain stable destinations.

Use pinned Vercel CLI `64.5.0` and an explicit `--project justgo-legal --scope
anthony-youngshin-yoos-projects`; never relink the repository root away from its
API project. Linking a staging directory can create an OIDC `.env.local`: remove
that generated local file and exclude all dotfiles from the upload. A dry run
must contain exactly `index.html`, `privacy/index.html`, `terms/index.html`,
`styles.css`, `assets/justgo-mark.png` and `vercel.json`. Stop on any other file;
never upload the source repository, review records or environment files.

After an authorized deploy, verify both stable HTTPS routes anonymously, the
original logo bytes and footer navigation. The October 25 publication passed
these checks; `/.env.local` and `/docs/legal/LEGAL_REVIEW.md` returned 404. The
project's model-training sharing is disabled. EAS preview public legal URLs and
App Store Connect's Privacy Policy URL use the published destinations. Actual
signed-iPhone opening/accessibility remains Phase 14 acceptance.
