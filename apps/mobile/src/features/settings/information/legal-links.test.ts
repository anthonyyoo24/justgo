import { appleStandardTerms, getLegalLinks } from './legal-links';
it.each([
  'http://example.com/privacy',
  'mailto:owner@example.com',
  'not a URL',
  'https://user:secret@example.com/privacy',
])('rejects unsafe public destinations: %s', (url) => {
  expect(getLegalLinks(url, url)).toEqual({ privacy: null, terms: null });
});
it('accepts public HTTPS and uses the Apple license while custom terms are unconfigured', () => {
  expect(getLegalLinks('https://example.com/privacy', '')).toEqual({
    privacy: 'https://example.com/privacy',
    terms: appleStandardTerms,
  });
});
