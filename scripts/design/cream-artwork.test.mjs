import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creamArtwork, peachArtwork } from './cream-artwork.mjs';

test('matches the light illustration backing to the peach text panel', () => {
  const pixels = Uint8Array.from([
    240,
    220,
    205,
    255, // Warm source backing.
    16,
    44,
    73,
    255, // Navy illustration line.
    240,
    220,
    205,
    110, // Soft outer edge.
    249,
    239,
    232,
    0, // Transparent paper matte.
  ]);
  const result = peachArtwork(pixels);
  assert.deepEqual(
    Array.from(result),
    [251, 227, 204, 255, 16, 44, 73, 255, 251, 227, 204, 110, 249, 239, 232, 0],
  );
  assert.deepEqual(Array.from(pixels.slice(4, 8)), [16, 44, 73, 255]);
});

test('adapts the backing without changing navy strokes or the original silhouette', () => {
  const pixels = Uint8Array.from([
    250,
    226,
    206,
    255, // Peach backing.
    16,
    44,
    73,
    255, // Navy stroke.
    250,
    226,
    206,
    110, // Soft outer edge.
    250,
    242,
    234,
    0, // Removed paper.
  ]);
  const original = pixels.slice();
  const result = creamArtwork(pixels);
  assert.deepEqual(
    Array.from(result),
    [248, 239, 231, 255, 16, 44, 73, 255, 248, 239, 231, 110, 250, 242, 234, 0],
  );
  assert.deepEqual(pixels, original);
});

test('retains paper texture and feathers antialiasing rather than tinting all the ink', () => {
  const result = creamArtwork(
    Uint8Array.from([
      250, 226, 206, 255, 248, 224, 204, 255, 252, 228, 208, 255, 160, 150, 140,
      255,
    ]),
  );
  assert.deepEqual(
    Array.from(result.slice(0, 12)),
    [248, 239, 231, 255, 246, 237, 229, 255, 250, 241, 233, 255],
  );
  assert.ok(result[13] > 150 && result[13] < 163);
});

test('fails visibly if a new source contains no usable peach backing', () => {
  assert.throws(
    () => creamArtwork(Uint8Array.from([16, 44, 73, 255])),
    /no peach backing/,
  );
});
