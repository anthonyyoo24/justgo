import { fireEvent, render } from '@testing-library/react-native';
import { ProviderButtons } from './ProviderButtons';

it.each(['apple', 'google'] as const)(
  'centers only a spinner in the busy %s button and disables duplicate actions',
  async (provider) => {
    const signIn = jest.fn();
    const label = `Sign in with ${provider === 'apple' ? 'Apple' : 'Google'}`;
    const screen = await render(
      <ProviderButtons onSignIn={signIn} busyProvider={provider} />,
    );
    const button = screen.getByRole('button', { name: label });
    expect(button).toBeDisabled();
    expect(screen.getByRole('button', { name: label, busy: true })).toBe(
      button,
    );
    expect(screen.queryByText(label)).toBeNull();
    expect(
      screen.getByRole('progressbar', {
        name: `Signing in with ${provider === 'apple' ? 'Apple' : 'Google'}`,
      }),
    ).toBeTruthy();
    for (const action of screen.getAllByRole('button')) {
      expect(action).toBeDisabled();
      await fireEvent.press(action);
    }
    expect(signIn).not.toHaveBeenCalled();
    await screen.rerender(<ProviderButtons onSignIn={signIn} />);
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.getByText(label)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: label }));
    expect(signIn).toHaveBeenCalledWith(provider);
  },
);

it('offers a usable retry after challenge preparation fails', async () => {
  const retry = jest.fn();
  const screen = await render(
    <ProviderButtons provider="apple" retry onSignIn={retry} />,
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  expect(retry).toHaveBeenCalledWith('apple');
});
