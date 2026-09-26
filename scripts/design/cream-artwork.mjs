// Palette adaptation of the original extracted RGBA art. Keep the alpha mask,
// texture and navy strokes; shift only the warm backing to the panel color.
function adaptArtwork(pixels, target) {
  const result = Uint8Array.from(pixels);
  const samples = [[], [], []];
  for (let i = 0; i < pixels.length; i += 4) {
    if (
      pixels[i] > 225 &&
      pixels[i + 3] > 245 &&
      pixels[i] - pixels[i + 2] > 18
    ) {
      for (let c = 0; c < 3; c++) samples[c].push(pixels[i + c]);
    }
  }
  if (!samples[0].length) throw new Error('Artwork has no peach backing');
  const peach = samples.map(
    (channel) => channel.sort((a, b) => a - b)[Math.floor(channel.length / 2)],
  );
  for (let i = 0; i < pixels.length; i += 4) {
    if (!pixels[i + 3]) continue;
    // Protect dark ink exactly; feather the shift through antialiased edges.
    const t = Math.max(0, Math.min(1, (pixels[i] - 100) / 120));
    const weight = t * t * (3 - 2 * t);
    for (let c = 0; c < 3; c++) {
      result[i + c] = Math.max(
        0,
        Math.min(
          255,
          Math.round(pixels[i + c] + weight * (target[c] - peach[c])),
        ),
      );
    }
  }
  return result;
}

export function peachArtwork(pixels) {
  return adaptArtwork(pixels, [251, 227, 204]);
}

// #F8EFE7 is the median backing sampled from the O4X-0 original image fill.
export function creamArtwork(pixels) {
  return adaptArtwork(pixels, [248, 239, 231]);
}
