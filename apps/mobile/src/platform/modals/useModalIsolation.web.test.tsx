/** @jest-environment node */
import { JSDOM } from 'jsdom';
import { renderHook } from '@testing-library/react-native';
import type { RefObject } from 'react';
import type { ViewInstance } from 'react-native';
import { useModalIsolation } from './useModalIsolation.web.ts';

// RN 0.88's preset owns global.window. Keep its Node environment and install
// only the real DOM document this platform adapter reads.
const dom = new JSDOM('<!doctype html><body></body>');
const previousDocument = Object.getOwnPropertyDescriptor(
  globalThis,
  'document',
);
beforeAll(() => {
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: dom.window.document,
  });
});
afterEach(() => document.body.replaceChildren());
afterAll(() => {
  dom.window.close();
  if (previousDocument)
    Object.defineProperty(globalThis, 'document', previousDocument);
  else Reflect.deleteProperty(globalThis, 'document');
});
it('isolates background navigation from pointer/keyboard/assistive access and restores existing attributes', async () => {
  const app = document.createElement('main');
  const previouslyHidden = document.createElement('aside');
  previouslyHidden.setAttribute('inert', '');
  previouslyHidden.setAttribute('aria-hidden', 'false');
  const portal = document.createElement('div');
  const surface = document.createElement('section');
  portal.append(surface);
  document.body.append(app, previouslyHidden, portal);
  const ref = { current: surface } as unknown as RefObject<ViewInstance | null>;
  const mounted = await renderHook(() => useModalIsolation(ref));
  expect(app.hasAttribute('inert')).toBe(true);
  expect(app.getAttribute('aria-hidden')).toBe('true');
  expect(portal.hasAttribute('inert')).toBe(false);
  await mounted.unmount();
  expect(app.hasAttribute('inert')).toBe(false);
  expect(app.hasAttribute('aria-hidden')).toBe(false);
  expect(previouslyHidden.getAttribute('aria-hidden')).toBe('false');
  expect(previouslyHidden.hasAttribute('inert')).toBe(true);
});
it('leaves the page unchanged if the modal has no attached surface', async () => {
  const app = document.createElement('main');
  document.body.append(app);
  const mounted = await renderHook(() => useModalIsolation({ current: null }));
  expect(app.hasAttribute('inert')).toBe(false);
  await mounted.unmount();
});
