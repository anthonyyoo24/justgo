import { publicHttpsUrl } from '../../../lib/public-url';

/** Configure the store ID only once the public listing can accept reviews. */
export function getCommunityLinks({
  appStoreId = process.env.EXPO_PUBLIC_APP_STORE_ID,
  instagram = process.env.EXPO_PUBLIC_INSTAGRAM_URL,
  tiktok = process.env.EXPO_PUBLIC_TIKTOK_URL,
  twitter = process.env.EXPO_PUBLIC_TWITTER_URL,
}: {
  appStoreId?: string;
  instagram?: string;
  tiktok?: string;
  twitter?: string;
} = {}) {
  const id = appStoreId?.trim();
  return {
    rate:
      id && /^[1-9]\d*$/.test(id)
        ? `https://apps.apple.com/app/id${id}?action=write-review`
        : null,
    instagram: publicHttpsUrl(instagram),
    tiktok: publicHttpsUrl(tiktok),
    twitter: publicHttpsUrl(twitter),
  };
}
