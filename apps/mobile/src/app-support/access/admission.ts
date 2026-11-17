/**
 * Whether the current owner may start a new challenge. JustGO is free with no
 * end date (Anthony, 2026-11-17), so every guest and account may, online or
 * offline, and the app shows no access screen. Phase 16 billing brings a paid
 * check back here. The API checks ownership and each upload on its own.
 */
export function canStartChallenge() {
  return true;
}
