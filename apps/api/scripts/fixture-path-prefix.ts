import { Hono } from 'hono';
import { mount } from 'hono/mount';
import type { ApiApp, ApiEnvironment } from '../src/http/request.js';

/** The path prefix a drive asks the fixture API to serve under, or '' for the root. */
export function fixturePathPrefix(value: string | undefined) {
  if (!value) return '';
  if (!/^(\/[A-Za-z0-9_-]+)+$/.test(value))
    throw new Error('Challenge fixtures require a plain path prefix');
  return value;
}

/** Serve the app under the prefix only, as a hosted function gateway does. */
export function underPathPrefix(app: ApiApp, prefix: string): ApiApp {
  if (!prefix) return app;
  const served = new Hono<ApiEnvironment>();
  served.all(`${prefix}/*`, mount(app.fetch));
  return served;
}
