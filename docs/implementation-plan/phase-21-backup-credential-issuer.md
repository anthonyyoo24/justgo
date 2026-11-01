<a id="phase-21"></a>

# Phase 21 — Automatic backup credential issuer

**Status:** Optional; not scheduled. Start only after accepted billing and analytics
and actual App Store publication.

## Outcome

Backup jobs obtain short-lived, narrowly scoped R2 upload credentials automatically,
reducing manual renewal without giving CI the parent signing credential or the
owner-held backup decryption key.

## Decisions in force

- Dependencies: accepted [Phase 16 billing](phase-16-billing.md#phase-16), accepted
  [Phase 17 analytics](phase-17-analytics.md#phase-17), and an actually published
  [Phase 14 App Store release](phase-14-release.md#phase-14). A TestFlight build,
  submission or review approval alone does not satisfy publication.
- Phases 18–20 are optional and are not dependencies. This phase does not gate
  Phase 15, beta testing, payments, analytics or the first App Store release.
- The [October 31 decision](../DECISIONS.md#october-31-optional-automatic-backup-credential-issuer)
  authorizes planning only. Implementation, provider access, any cost and activation
  still need the applicable owner approvals when this optional phase is scheduled.
- Until an accepted replacement is active, Anthony owns manual upload-credential
  renewal by day five under the existing [backup guide](../operations/CLOUDFLARE_BACKUPS.md).
  The current parent credential stays locally outside CI. Under the
  [October 31 custody decision](../DECISIONS.md#october-31-local-recovery-key-custody-and-coordinated-cutover),
  the private `age` decryption identity stays owner-held in protected local Mac
  storage outside CI and the issuer; USB/off-Mac verification is not a prerequisite.

## Implement

- Verify the current R2 temporary-credential and workload-identity contracts when
  scheduled. Design a separately protected issuer and present its exact authority,
  cost, parent-secret custody, rotation and compromise/revocation procedure before
  activation. Moving the local parent signing credential into an online issuer
  changes the current custody policy; this plan does not approve that change now.
- Authenticate the backup workflow with short-lived workload identity bound to the
  approved repository, workflow, ref and protected environment. Reject fork/PR,
  wrong-audience, expired and replayed requests. Do not add an unauthenticated
  minting endpoint or a reusable issuer password in CI.
- Issue only the existing approved uploader capabilities: `PutObject` and
  `HeadObject` within the exact environment's database/ledger prefixes and bucket.
  Keep the existing maximum seven-day lifetime or a shorter per-run lifetime;
  callers cannot choose broader actions, resources or expiry. Keep bucket
  administration, public access and retention outside issuer authority. Derived
  credentials must not allow reading object contents, listing or deletion.
  Document and obtain approval for the parent's actual authority, including any
  required ability to read or delete objects; narrow child tokens do not remove
  that issuer exposure.
- Keep the parent signing credential inside the issuer's protected secret boundary,
  outside Actions and app/API clients. Keep database-reader and read-only inspection
  credentials separate; document which renewals still require Anthony, including
  parent expiry/rotation. Bound issuance to parent validity and verify revocation
  behavior; automation must not be described as indefinitely unattended.
- Integrate with the existing backup job and policy/expiry guards. Issuer outages,
  invalid identity, revocation or renewal failure must fail closed and reach the
  existing failed/missed-backup alerts, without broad-token or plaintext fallback.
  Redact credentials from responses logged by callers, errors and CI artifacts.
- Rehearse parent rotation/revocation, issuer disablement and rollback to the
  documented manual-renewal procedure. Preserve object locks, approved retention,
  conditional unique uploads, uncertain-upload handling and safe-restore checks.

## Keep out

- No immediate issuer deployment, online parent-secret migration or change to the
  current manual-renewal policy as part of Phase 15 or this planning request.
- No backup decryption identity in CI, the issuer or another online service.
- No broader uploader access, longer credential lifetime, retention changes,
  backup-schedule changes or replacement of the separate deletion-ledger work.

## Ready to hand off when

- [ ] Phase 16 and 17 acceptance and actual Phase 14 App Store publication are
      evidenced, and Anthony has scheduled this optional work.
- [ ] The precise online-parent custody, authority, costs and activation policy
      are approved; human renewal/rotation and incident ownership are named.
- [ ] Allowed issuance and rejection of wrong identity, replay, scope escalation,
      expired/revoked parents and issuer outages have focused regression evidence.
- [ ] A hosted encrypted canary upload/HEAD and existing backup/restore checks
      pass with issued credentials; forbidden actions remain denied and no secret
      appears in logs or artifacts.
- [ ] Rotation, failed/missed-job notification delivery, disablement and manual
      rollback are verified before replacing the current renewal procedure.
- [ ] Update the backup operations guide and save the phase handoff with actual
      evidence, remaining human duties and next steps; link it from the handoff index.

## Open gates for earlier phases

None added by this optional phase. Earlier backup, recovery, privacy and release
requirements retain their existing owners and acceptance criteria.
