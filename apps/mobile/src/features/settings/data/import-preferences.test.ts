import { applyImportedPreferences } from './import-preferences';
import { motionPreferenceKey } from '../../../platform/motion/motion';
import { hapticsPreferenceKey } from '../../../platform/haptics/haptics';
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));
function setup() {
  const values = new Map<string, string>();
  const storage = { getItem: async (key: string) => values.get(key) ?? null };
  const controls = {
    setReduced: jest.fn(async (value: boolean) => {
      values.set(motionPreferenceKey, String(value));
    }),
    setHaptics: jest.fn(async (value: boolean) => {
      values.set(hapticsPreferenceKey, String(value));
    }),
  };
  return { values, storage, controls };
}
it('requires both requested preferences to be durably readable before reporting a full import', async () => {
  const ctx = setup();
  await applyImportedPreferences(
    { reduceMotion: true, haptics: false },
    ctx.controls,
    () => {},
    ctx.storage,
  );
  expect(ctx.values.get(motionPreferenceKey)).toBe('true');
  expect(ctx.values.get(hapticsPreferenceKey)).toBe('false');
});
it('detects a provider setter that swallowed a storage failure', async () => {
  const ctx = setup();
  ctx.controls.setReduced.mockResolvedValueOnce(undefined);
  await expect(
    applyImportedPreferences(
      { reduceMotion: true, haptics: false },
      ctx.controls,
      () => {},
      ctx.storage,
    ),
  ).rejects.toMatchObject({ code: 'STORAGE' });
});
it('does not apply the next preference after an account change', async () => {
  const ctx = setup();
  let checks = 0;
  await expect(
    applyImportedPreferences(
      { reduceMotion: true, haptics: false },
      ctx.controls,
      () => {
        if (++checks > 1) throw new Error('Changed');
      },
      ctx.storage,
    ),
  ).rejects.toThrow('Changed');
  expect(ctx.controls.setHaptics).not.toHaveBeenCalled();
});
