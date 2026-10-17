import type { Href } from 'expo-router';

// These cases compile with the generated route declaration during typechecking.
// Unused @ts-expect-error directives fail if generation stops restricting routes.
export const knownRoutes: Href[] = [
  '/',
  '/access',
  '/progress',
  '/challenge',
  '/success',
  { pathname: '/reflection', params: { attemptId: 'synthetic-attempt' } },
  '/settings',
  '/recovery',
  '/account/recover',
  '/account/keys',
  '/account/devices',
  '/account/transfer',
  '/account/troubleshooting',
  '/welcome',
  '/delete-account',
  '/preview?mode=haptics',
  // @ts-expect-error Unknown routes must not be accepted.
  '/no-such-route',
  // @ts-expect-error Account pages are static routes, not arbitrary tool names.
  '/account/toString',
  // @ts-expect-error The obsolete export redirect has no route.
  '/export-data',
];
