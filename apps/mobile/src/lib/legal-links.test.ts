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

it.each([
  'http://localhost:8095/privacy/',
  'http://127.0.0.1:8095/privacy/',
  'http://[::1]:8095/privacy/',
  'http://10.0.0.200:8095/privacy/',
  'http://172.16.0.1:8095/privacy/',
  'http://172.31.255.254:8095/privacy/',
  'http://192.168.1.10:8095/privacy/',
])(
  'opens an explicitly configured local reader only in development: %s',
  (url) => {
    expect(
      getLegalLinks(url, 'https://example.com/terms', undefined, true),
    ).toEqual({
      privacy: url,
      terms: 'https://example.com/terms',
      development: true,
    });
    expect(getLegalLinks(url, url, undefined, false)).toEqual({
      privacy: null,
      terms: null,
      development: false,
    });
  },
);

it.each([
  'http://172.15.255.255/privacy/',
  'http://172.32.0.1/privacy/',
  'http://192.169.1.10/privacy/',
  'http://10.example.com/privacy/',
  'http://localhost.example.com/privacy/',
  'http://user:secret@10.0.0.200:8095/privacy/',
  'http://10.0.0.200:8095/privacy/?token=x',
  'http://10.0.0.200:8095/privacy/#secret',
])('rejects unsafe HTTP reader destinations even in development: %s', (url) => {
  expect(getLegalLinks(url, url, undefined, true)).toEqual({
    privacy: null,
    terms: null,
    development: false,
  });
});
