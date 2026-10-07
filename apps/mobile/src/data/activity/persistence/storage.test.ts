import AsyncStorage from '@react-native-async-storage/async-storage';
import { asyncStorageJournalStorage } from './storage';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));
it('awaits storage results and propagates native failures without reporting false durability', async () => {
  jest.mocked(AsyncStorage.getItem).mockResolvedValue('stored fixture');
  await expect(asyncStorageJournalStorage.getItem('fixture')).resolves.toBe(
    'stored fixture',
  );
  jest
    .mocked(AsyncStorage.setItem)
    .mockRejectedValue(
      Object.assign(new Error('fixture failure'), { code: 'ENOSPC' }),
    );
  await expect(
    asyncStorageJournalStorage.setItem('fixture', 'value'),
  ).rejects.toMatchObject({ code: 'ENOSPC' });
  jest.mocked(AsyncStorage.removeItem).mockResolvedValue();
  await asyncStorageJournalStorage.removeItem('fixture');
  expect(AsyncStorage.removeItem).toHaveBeenCalledWith('fixture');
});
