import { hapticAdapter } from './haptic-feedback.web';

it('keeps web previews quiet without using browser vibration', async () => {
  expect(hapticAdapter.isAvailable()).toBe(false);
  await expect(
    hapticAdapter.play('completed', () => true),
  ).resolves.toBeUndefined();
  expect(() => hapticAdapter.playPreset('batter')).not.toThrow();
  expect(() => hapticAdapter.stop()).not.toThrow();
});
