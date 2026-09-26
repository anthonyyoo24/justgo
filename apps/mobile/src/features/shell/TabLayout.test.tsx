import { render } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Tabs } from 'expo-router/js-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import TabLayout from '../../app/(tabs)/_layout';

jest.mock('expo-router/js-tabs', () => {
  const Tabs = Object.assign(
    jest.fn(({ children }: { children: ReactNode }) => children),
    { Screen: () => null },
  );
  return { Tabs };
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: jest.fn(),
}));

it.each([
  { bottom: 0, height: 52, paddingBottom: 0, iconMarginTop: 5 },
  { bottom: 34, height: 64, paddingBottom: 8, iconMarginTop: 10 },
])(
  'keeps the tab bar compact and icons centered with bottom inset $bottom',
  ({ bottom, height, paddingBottom, iconMarginTop }) => {
    jest.mocked(useSafeAreaInsets).mockReturnValue({
      bottom,
      top: 0,
      left: 0,
      right: 0,
    });
    render(<TabLayout />);
    const tabProps = (Tabs as unknown as jest.Mock).mock.lastCall?.[0] as {
      screenOptions: {
        tabBarStyle: { height: number; paddingBottom: number };
        tabBarIconStyle: { marginTop: number };
        sceneStyle: { backgroundColor: string };
      };
    };
    expect(tabProps.screenOptions.tabBarStyle).toMatchObject({
      height,
      paddingBottom,
    });
    expect(tabProps.screenOptions.tabBarIconStyle.marginTop).toBe(
      iconMarginTop,
    );
    expect(tabProps.screenOptions.sceneStyle.backgroundColor).toBe('#F9EFE8');
  },
);
