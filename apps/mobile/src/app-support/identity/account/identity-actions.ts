/** Stable presentation identities remain independent of button labels. */
export type IdentityActionId =
  | 'create-account'
  | 'create-separate-account'
  | 'start-transfer'
  | 'restart-transfer'
  | 'finish-transfer'
  | 'recover-key'
  | 'retry-connection'
  | `recover-credential:${string}`;
