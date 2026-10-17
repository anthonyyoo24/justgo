import type { IdentityErrorCode } from '@justgo/contracts';

/** Safe HTTP failure metadata; messages contain only public contract codes. */
export class ApiError extends Error {
  constructor(
    public readonly code: IdentityErrorCode,
    public readonly status = 401,
    public readonly retryAfterSeconds?: number,
  ) {
    super(code);
  }
  response(requestId: string) {
    return { code: this.code, requestId };
  }
}
