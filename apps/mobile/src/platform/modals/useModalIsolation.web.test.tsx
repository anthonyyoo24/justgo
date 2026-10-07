/** @jest-environment jsdom */
import { renderHook } from '@testing-library/react-native';
import type { RefObject } from 'react';
import type { View } from 'react-native';
import { useModalIsolation } from './useModalIsolation.web';

afterEach(() => document.body.replaceChildren());
it('isolates background navigation from pointer/keyboard/assistive access and restores existing attributes', () => {
  const app = document.createElement('main');
  const previouslyHidden = document.createElement('aside');
  previouslyHidden.setAttribute('inert', '');
  previouslyHidden.setAttribute('aria-hidden', 'false');
  const portal = document.createElement('div');
  const surface = document.createElement('section');
  portal.append(surface);
  document.body.append(app, previouslyHidden, portal);
  const ref = { current: surface } as unknown as RefObject<View | null>;
  const mounted = renderHook(() => useModalIsolation(ref));
  expect(app.hasAttribute('inert')).toBe(true);
  expect(app.getAttribute('aria-hidden')).toBe('true');
  expect(portal.hasAttribute('inert')).toBe(false);
  mounted.unmount();
  expect(app.hasAttribute('inert')).toBe(false);
  expect(app.hasAttribute('aria-hidden')).toBe(false);
  expect(previouslyHidden.getAttribute('aria-hidden')).toBe('false');
  expect(previouslyHidden.hasAttribute('inert')).toBe(true);
});
it('leaves the page unchanged if the modal has no attached surface', () => {
  const app = document.createElement('main');
  document.body.append(app);
  const mounted = renderHook(() => useModalIsolation({ current: null }));
  expect(app.hasAttribute('inert')).toBe(false);
  mounted.unmount();
});
