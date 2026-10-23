import { managedSessionCheckBody } from '../../../src/db/managed-session-check.js';

export const managedSessionHelper = () => ({
  body: managedSessionCheckBody,
  owner: 'postgres',
  schema_owner: 'postgres',
  language: 'sql',
  security_definer: true,
  strict: true,
  volatility: 's',
  configuration: ['search_path=""'],
  arguments: ['session_id', 'auth_user_id'],
  boolean_result: true,
  schema_acl_ok: true,
  function_acl_ok: true,
  runtime_usage: true,
  runtime_execute: true,
  runtime_create: false,
  other_roles_exposed: false,
  runtime_owner_access: false,
  runtime_auth_access: false,
});
