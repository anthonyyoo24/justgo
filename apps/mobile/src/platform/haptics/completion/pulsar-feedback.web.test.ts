import { pulsarAdapter } from './pulsar-feedback.web';
it('keeps the browser quiet without loading the native SDK', () => {
  expect(pulsarAdapter.isAvailable()).toBe(false);
  expect(pulsarAdapter.play('bloom')).toBeUndefined();
  expect(pulsarAdapter.stop()).toBeUndefined();
});
