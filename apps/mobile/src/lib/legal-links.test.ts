import { getLegalLinks } from './legal-links';
it.each([
  'http://example.com/privacy',
  'mailto:owner@example.com',
  'not a URL',
  'https://user:secret@example.com/privacy',
])('rejects unsafe public destinations: %s', (url) => {
  expect(getLegalLinks(url, url)).toEqual({
    privacy: null,
    terms: null,
    development: false,
  });
});
it('uses configured HTTPS notices and never substitutes an unrelated license', () => {
  expect(
    getLegalLinks('https://example.com/privacy', '', undefined, false),
  ).toEqual({
    privacy: 'https://example.com/privacy',
    terms: null,
    development: false,
  });
});
it('provides labeled loopback drafts only in development', () => {
  expect(getLegalLinks('', '', 'http://127.0.0.1:3000', true)).toEqual({
    privacy: 'http://127.0.0.1:3000/legal/privacy',
    terms: 'http://127.0.0.1:3000/legal/terms',
    development: true,
  });
});
it.each([
  'https://hosted.example.com',
  'http://192.168.1.1:3000',
  'http://user:secret@localhost:3000',
  'http://localhost:3000/?token=x',
  'not a URL',
])('never treats %s as a local draft server', (api) => {
  expect(getLegalLinks('', '', api, true)).toEqual({
    privacy: null,
    terms: null,
    development: false,
  });
});
it('does not expose draft destinations in a release build', () => {
  expect(getLegalLinks('', '', 'http://localhost:3000', false)).toEqual({
    privacy: null,
    terms: null,
    development: false,
  });
});
