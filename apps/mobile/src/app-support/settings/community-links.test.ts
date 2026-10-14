import { getCommunityLinks } from './community-links';

const unconfigured = { appStoreId: '', instagram: '', tiktok: '', twitter: '' };

it('leaves unconfigured rating and social destinations unavailable', () => {
  expect(getCommunityLinks(unconfigured)).toEqual({
    rate: null,
    instagram: null,
    tiktok: null,
    twitter: null,
  });
});

it('uses the exact public profiles and a direct App Store review destination', () => {
  expect(
    getCommunityLinks({
      appStoreId: ' 1234567890 ',
      instagram: 'https://www.instagram.com/justgo-test',
      tiktok: 'https://www.tiktok.com/@justgo-test',
      twitter: 'https://x.com/justgo-test',
    }),
  ).toEqual({
    rate: 'https://apps.apple.com/app/id1234567890?action=write-review',
    instagram: 'https://www.instagram.com/justgo-test',
    tiktok: 'https://www.tiktok.com/@justgo-test',
    twitter: 'https://x.com/justgo-test',
  });
});

it.each(['0', '-12', 'dev.justgo.foundation', '123?action=anything'])(
  'rejects an invalid store identifier: %s',
  (appStoreId) => {
    expect(getCommunityLinks({ ...unconfigured, appStoreId }).rate).toBeNull();
  },
);

it.each([
  'not a URL',
  'http://example.com/profile',
  'javascript:alert(1)',
  'https://user:secret@example.com/profile',
])('rejects unsafe social destinations: %s', (url) => {
  expect(
    getCommunityLinks({
      ...unconfigured,
      instagram: url,
      tiktok: url,
      twitter: url,
    }),
  ).toEqual({ rate: null, instagram: null, tiktok: null, twitter: null });
});
