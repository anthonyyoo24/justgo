// Deterministic extraction of approved Paper pixels; no generated/replacement art.
// Usage: NODE_PATH=<directory containing sharp> node scripts/design/extract-challenge-assets.mjs
// Source image fills and crop geometry: docs/design-source/challenge-paper-extract.json.
import { createRequire } from 'node:module';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { creamArtwork, peachArtwork } from './cream-artwork.mjs';
const loadDependency = createRequire(import.meta.url);
const sharp = loadDependency('sharp');
const source = path.resolve('output/challenge-fidelity/source');
const destination = path.resolve('apps/mobile/assets/challenges/venues');
const decoration = path.resolve('apps/mobile/assets/challenges/decoration');
const scale = 4;
const sources = {
  gym: '0ZPS0RHMYATMEBFBKS035T53AM.png',
  park: '043YX9A01B0SRPSHV2VM4763HS.png',
  bookstore: '00AF17VV3ZKSWRG6SAGQT6EHK1.png',
  bars: '01M332VHAFDZD77X5VH21G7DJ4.png',
  cafe: '2GRQXFFZ1HGVHXG3D23YJFKKHB.png',
  streets: '01M34TVAPC8EBZMGPC5CQRV4CW.png',
  'streets-person': '01M34SP1WBCZE1EH2SPHT4MH7P.png',
  'streets-crossing': '01M34PY9RMCZ4849028Z6PE4FN.png',
};
async function sheet(name, width = 320, height = 611) {
  const filename = path.join(source, name + '.png');
  try {
    await fs.access(filename);
  } catch {
    const response = await globalThis.fetch(
      'https://app.paper.design/file-assets/01M06AN54B8CZHGDPRD8XY0880/' +
        sources[name],
    );
    if (!response.ok) throw new Error(`${name}: ${response.status}`);
    await fs.writeFile(filename, Buffer.from(await response.arrayBuffer()));
  }
  return sharp(filename)
    .resize(Math.round(width * scale), Math.round(height * scale))
    .png()
    .toBuffer();
}
async function crop(input, x, y, width, height) {
  return sharp(input)
    .extract({
      left: Math.round(x * scale),
      top: Math.round(y * scale),
      width: Math.round(width * scale),
      height: Math.round(height * scale),
    })
    .png()
    .toBuffer();
}
async function removePaper(input, inkOnly = false) {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  // Estimate the surrounding paper from the top edge, away from the illustration.
  let red = 0,
    blue = 0;
  for (let x = 0; x < info.width; x++) {
    red += data[x * 4];
    blue += data[x * 4 + 2];
  }
  red /= info.width;
  blue /= info.width;
  for (let i = 0; i < data.length; i += 4) {
    const darkness = (red - data[i] - 12) / 65;
    const warmth = inkOnly
      ? 0
      : (data[i] - data[i + 2] - (red - blue) - 4) / 13;
    data[i + 3] = Math.round(
      255 * Math.max(0, Math.min(1, Math.max(darkness, warmth))),
    );
  }
  return sharp(data, { raw: info }).png().toBuffer();
}
async function main() {
  await fs.mkdir(source, { recursive: true });
  await fs.mkdir(destination, { recursive: true });
  await fs.mkdir(decoration, { recursive: true });
  for (const name of ['gym', 'park', 'bookstore', 'bars', 'cafe']) {
    const image = await sheet(name, 320, name === 'cafe' ? 569 : 611);
    const art = await crop(image, 123, name === 'cafe' ? 198 : 240, 78, 63);
    await fs.writeFile(
      path.join(destination, name + '.png'),
      await removePaper(art),
    );
  }
  const street = await crop(
    await sheet('streets', 277, 529),
    110.4,
    204.1,
    60,
    58,
  );
  const person = await crop(
    await sheet('streets-person', 277, 529),
    134.4,
    223.1,
    9,
    26,
  );
  const crossingSource = await sheet('streets-crossing', 277, 529);
  const crossing = await crop(crossingSource, 132.4, 243.1, 21, 7.5);
  const left = await crop(crossingSource, 132.4, 243.1, 7.5, 7.5);
  const right = await crop(crossingSource, 145.9, 243.1, 7.5, 7.5);
  const streets = await sharp(street)
    .composite([
      { input: person, left: 24 * scale, top: 12 * scale },
      { input: crossing, left: 18 * scale, top: 38 * scale },
      { input: left, left: 10.5 * scale, top: 38 * scale },
      { input: right, left: 38.5 * scale, top: 38 * scale },
    ])
    .png()
    .toBuffer();
  await fs.writeFile(
    path.join(destination, 'streets.png'),
    await removePaper(streets),
  );
  // Match each illustration backing to its card's intrinsic text panel. Both
  // variants retain the original silhouettes, ink, alpha and paper texture.
  for (const name of ['gym', 'park', 'bookstore', 'bars', 'cafe', 'streets']) {
    const { data, info } = await sharp(path.join(destination, name + '.png'))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const peach = await sharp(Buffer.from(peachArtwork(data)), { raw: info })
      .png()
      .toBuffer();
    await sharp(Buffer.from(creamArtwork(data)), { raw: info })
      .png()
      .toFile(path.join(destination, name + '-cream.png'));
    await fs.writeFile(path.join(destination, name + '.png'), peach);
  }
  const gym = await sheet('gym');
  await fs.writeFile(
    path.join(decoration, 'lower-flourish.png'),
    await removePaper(await crop(gym, 68, 433, 88, 27), true),
  );
  await fs.writeFile(
    path.join(decoration, 'paper-texture.png'),
    await crop(gym, 94, 195, 100, 20),
  );
  // The retained original fills live in the ignored output folder, not the app bundle.
  for (const name of ['streets-person', 'streets-crossing'])
    await fs.rm(path.join(destination, name + '.png'), { force: true });
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
