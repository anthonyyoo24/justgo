import { useLayoutEffect, type RefObject } from 'react';
import type { View } from 'react-native';

/** RN Web traps focus, but leaves the underlying page exposed to assistive tools. */
export function useModalIsolation(surface: RefObject<View | null>) {
  useLayoutEffect(() => {
    const node = surface.current as unknown as HTMLElement | null;
    if (!node) return;
    const siblings = [...document.body.children].filter(
      (element) => !element.contains(node),
    );
    const previous = siblings.map((element) => ({
      element,
      inert: element.getAttribute('inert'),
      hidden: element.getAttribute('aria-hidden'),
    }));
    for (const { element } of previous) {
      element.setAttribute('inert', '');
      element.setAttribute('aria-hidden', 'true');
    }
    return () => {
      for (const { element, inert, hidden } of previous) {
        if (inert === null) element.removeAttribute('inert');
        else element.setAttribute('inert', inert);
        if (hidden === null) element.removeAttribute('aria-hidden');
        else element.setAttribute('aria-hidden', hidden);
      }
    };
  }, [surface]);
}
