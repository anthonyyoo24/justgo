import type { ErrorEvent, StackFrame } from '@sentry/react-native';
import type { DiagnosticEnvironment } from './configuration';

export type DiagnosticBuild = Readonly<{
  version: string;
  build?: string;
  os: 'ios' | 'web';
  osVersion: string;
  environment: DiagnosticEnvironment;
}>;
const object = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
const technicalVersion = (value: string) =>
  /^[0-9][0-9A-Za-z.+_-]{0,47}$/.test(value) ? value : 'unknown';
const coordinate = (value: unknown) =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= 0 &&
  value < 1e9
    ? value
    : undefined;

/** Keep known bundle locations; strip paths, hashes, credentials and parameters. */
export function diagnosticFilename(value: unknown): string | undefined {
  if (typeof value !== 'string') return;
  const path = value.split(/[?#]/)[0] ?? '';
  if (/(?:^|\/)main\.jsbundle$/.test(path)) return 'app:///main.jsbundle';
  if (
    /(?:^|\/)(?:\.virtual-metro-entry\.bundle|(?:index|entry|main)(?:-[0-9a-f]{8,64})?(?:\.ios|\.web)?\.(?:bundle|js))$/.test(
      path,
    )
  )
    return 'app:///index.bundle';
  return;
}
function frame(value: unknown): StackFrame | null {
  const input = object(value);
  if (!input) return null;
  const filename = diagnosticFilename(input.filename);
  if (!filename) return null;
  const lineno = coordinate(input.lineno);
  const colno = coordinate(input.colno);

  return {
    filename,
    ...(lineno === undefined ? {} : { lineno }),
    ...(colno === undefined ? {} : { colno }),
    ...(typeof input.in_app === 'boolean' ? { in_app: input.in_app } : {}),
  };
}

/** Rebuild, never spread: SDK additions and private Error/React context fail closed. */
export function diagnosticEvent(
  value: unknown,
  build: DiagnosticBuild,
): ErrorEvent | null {
  try {
    const input = object(value);
    if (!input || (input.type !== undefined && input.type !== 'error'))
      return null;
    const exceptions = object(input.exception)?.values;
    if (!Array.isArray(exceptions) || exceptions.length === 0) return null;
    const last = object(exceptions[exceptions.length - 1]);
    if (!last) return null;
    const frames = object(last.stacktrace)?.frames;
    const safeFrames = Array.isArray(frames)
      ? frames
          .slice(-64)
          .map(frame)
          .filter((item): item is StackFrame => !!item)
      : [];
    const handled = object(last.mechanism)?.handled !== false;
    const images = object(input.debug_meta)?.images;
    const safeImages = Array.isArray(images)
      ? images
          .flatMap((image) => {
            const item = object(image);
            return item?.type === 'sourcemap' &&
              typeof item.debug_id === 'string' &&
              /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(
                item.debug_id,
              )
              ? [
                  {
                    type: 'sourcemap' as const,
                    debug_id: item.debug_id,
                    code_file:
                      diagnosticFilename(item.code_file) ??
                      'app:///index.bundle',
                  },
                ]
              : [];
          })
          .slice(0, 4)
      : [];
    const version = technicalVersion(build.version);
    return {
      ...(typeof input.event_id === 'string' &&
      /^[a-f0-9]{32}$/.test(input.event_id)
        ? { event_id: input.event_id }
        : {}),
      ...(typeof input.timestamp === 'number' &&
      Number.isFinite(input.timestamp)
        ? { timestamp: input.timestamp }
        : {}),
      type: undefined,
      platform: 'javascript',
      level: input.level === 'fatal' ? 'fatal' : 'error',
      release: `justgo-mobile@${version}`,
      ...(build.build ? { dist: technicalVersion(build.build) } : {}),
      environment: build.environment,
      user: { ip_address: '0.0.0.0' },
      contexts: {
        app: {
          app_version: version,
          ...(build.build ? { app_build: technicalVersion(build.build) } : {}),
        },
        os: {
          name: build.os === 'ios' ? 'iOS' : 'Web',
          version: technicalVersion(build.osVersion),
        },
      },
      exception: {
        values: [
          {
            type: 'ApplicationError',
            value: 'The application encountered an error.',
            mechanism: { type: 'generic', handled },
            ...(safeFrames.length
              ? { stacktrace: { frames: safeFrames } }
              : {}),
          },
        ],
      },
      ...(safeImages.length ? { debug_meta: { images: safeImages } } : {}),
    };
  } catch {
    // Hostile getters/corrupt SDK data must never interrupt the original operation.
    return null;
  }
}
