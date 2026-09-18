import { createTelemetry } from './telemetry';
it('exports no events for any consent state until a vendor is approved', () => {
  const telemetry = createTelemetry();
  for (const consent of ['unknown', 'declined', 'granted'] as const) {
    telemetry.setConsent(consent);
    expect(telemetry.track('app_foregrounded')).toBe(false);
  }
});
