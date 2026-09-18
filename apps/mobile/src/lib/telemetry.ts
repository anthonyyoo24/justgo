export type AnalyticsConsent = 'unknown' | 'declined' | 'granted';
export type TelemetryEvent =
  'app_foregrounded' | 'home_viewed' | 'progress_viewed';
export function createTelemetry() {
  let consent: AnalyticsConsent = 'unknown';
  return {
    setConsent(next: AnalyticsConsent) {
      consent = next;
    },
    track(_event: TelemetryEvent): boolean {
      void _event;
      if (consent !== 'granted') return false;
      // No exporter until privacy choices, event allowlist and vendor setup are approved.
      return false;
    },
  };
}
