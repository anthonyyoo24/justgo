# Legal text approvals

This record lists each legal text version Anthony approved, when he approved it
and where it is published. Git history keeps the earlier review notes.

| Document                           | Version                                   | Approved by Anthony                   | Effective  | Publication                                                                                                                                                                                                                                                                                           |
| ---------------------------------- | ----------------------------------------- | ------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Privacy Policy, U.S. region        | Pending; proposed `2026-11-<dd>-us-east`  | 2026-11-13, text only                 | Pending    | Not published. Candidate `privacy-us-east-candidate`. It publishes only together with build 8, on the day the version names. The [U.S. region candidate](SUPABASE_NOTICE_REVIEW.md#us-region-candidate) lists the conditions. A lawyer should review the cross-border wording before the paid launch. |
| Terms of Use, no operator name     | Pending; proposed `2026-11-<dd>-us-east`  | 2026-11-13, text only                 | Pending    | Not published. Candidate `terms-us-east-candidate` drops the operator's name and province and changes nothing else. It publishes together with build 8 and the U.S. region Privacy candidate.                                                                                                         |
| Privacy Policy                     | `2026-11-13-supabase-edge`                | 2026-11-13, text and publication      | 2026-11-13 | Current. Published 2026-11-13 at [justgo-legal.vercel.app/privacy](https://justgo-legal.vercel.app/privacy/) after backups resumed. Anonymous HTTPS reads matched the approved build. The [Supabase notice review](SUPABASE_NOTICE_REVIEW.md) records it.                                             |
| Privacy Policy                     | `2026-10-27-essential-errors`             | 2026-10-27, text and publication      | 2026-10-27 | Published 2026-10-27. Replaced 2026-11-13.                                                                                                                                                                                                                                                            |
| Terms of Use                       | `2026-10-25-beta`                         | 2026-10-25, final wording and hosting | 2026-10-25 | Current. Published 2026-10-25 at [justgo-legal.vercel.app/terms](https://justgo-legal.vercel.app/terms/).                                                                                                                                                                                             |
| Privacy Policy, Cloudflare hosting | Pending; proposed `2026-10-30-cloudflare` | 2026-10-30, text only                 | Pending    | Never published. Replaced by `2026-11-13-supabase-edge`, which keeps its R2 backup wording.                                                                                                                                                                                                           |
| Privacy Policy                     | `2026-10-25-beta`                         | 2026-10-25, final wording and hosting | 2026-10-25 | Published 2026-10-25. Replaced 2026-10-27.                                                                                                                                                                                                                                                            |
| Privacy Policy and Terms of Use    | `2026-10-18-launch-candidate`             | 2026-10-19, text only                 | None       | Never published. Replaced by the managed-sync text.                                                                                                                                                                                                                                                   |

`PRIVACY_POLICY_DRAFT.md` and `TERMS_DRAFT.md` hold the current text and its
approval metadata. Provider and compliance acceptances, such as the Sentry DPA
and the Cloudflare assessment, are in the [data inventory](DATA_INVENTORY.md).

An approval covers the document text and, where the table says so, its
publication. It does not settle provider suitability, commercial hosting
eligibility, deletion duties or signed-device acceptance. It authorizes no
provider contact, plan upgrade, agreement acceptance, billing, App Store
submission or Git publication. The [data inventory](DATA_INVENTORY.md),
[release disclosures](RELEASE_DISCLOSURES.md) and
[`gate` issues](https://github.com/anthonyyoo24/justgo/issues?q=label%3Agate)
hold the open conditions.

## Recording an approval

1. Anthony reviews the exact public text and the
   [release disclosures](RELEASE_DISCLOSURES.md). Automated research does not
   replace his review or any applicable legal review. A change to paid features,
   providers or data flows needs a fresh review before use.
2. After he approves, set `legal-version`, `publication-status: owner-approved`
   and `effective-date` in the draft. Use the real publication date and a
   matching version. Never backdate.
3. Publication needs its own authorization. Follow the
   [legal site guide](../../sites/legal/README.md#publishing-updates): build in
   production mode, check that the upload holds only public files, then verify
   both pages anonymously over HTTPS on a phone.
4. Point `EXPO_PUBLIC_TERMS_URL`, `EXPO_PUBLIC_PRIVACY_POLICY_URL` and the App
   Store Connect Privacy Policy URL only at verified published addresses.
5. Add a row to the table above.
