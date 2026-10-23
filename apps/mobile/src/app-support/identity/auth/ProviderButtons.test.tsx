import { fireEvent, render } from '@testing-library/react-native';
import { ProviderButtons } from './ProviderButtons';

it.each(['apple', 'google'] as const)(
  'centers only a spinner in the busy %s button and disables duplicate actions',
  (provider) => {
    const signIn = jest.fn();
    const label = `Sign in with ${provider === 'apple' ? 'Apple' : 'Google'}`;
    const screen = render(
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
      fireEvent.press(action);
    }
    expect(signIn).not.toHaveBeenCalled();
    screen.rerender(<ProviderButtons onSignIn={signIn} />);
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.getByText(label)).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: label }));
    expect(signIn).toHaveBeenCalledWith(provider);
  },
);

it('offers a usable retry after challenge preparation fails', () => {
  const retry = jest.fn();
  const screen = render(
    <ProviderButtons provider="apple" retry onSignIn={retry} />,
  );
  fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  expect(retry).toHaveBeenCalledWith('apple');
});
