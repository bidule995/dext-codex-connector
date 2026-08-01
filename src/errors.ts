export const ConnectorErrorCode = {
  AuthenticationRequired: "authentication_required",
  PermissionDenied: "permission_denied",
  NotFound: "not_found",
  InvalidInput: "invalid_input",
  Conflict: "conflict",
  RateLimited: "rate_limited",
  ProcessingPending: "processing_pending",
  UpstreamUnavailable: "upstream_unavailable",
  UnsupportedCapability: "unsupported_capability"
} as const;

export type ConnectorErrorCode =
  (typeof ConnectorErrorCode)[keyof typeof ConnectorErrorCode];

export interface ConnectorErrorOptions {
  code: ConnectorErrorCode;
  message: string;
  retryable?: boolean;
  retryAfterMs?: number;
  cause?: unknown;
}

export class ConnectorError extends Error {
  readonly code: ConnectorErrorCode;
  readonly retryable: boolean;
  readonly retryAfterMs: number | undefined;

  constructor(options: ConnectorErrorOptions) {
    super(options.message, { cause: options.cause });
    this.name = "ConnectorError";
    this.code = options.code;
    this.retryable = options.retryable ?? false;
    this.retryAfterMs = options.retryAfterMs;
  }
}

export function asConnectorError(error: unknown): ConnectorError {
  if (error instanceof ConnectorError) {
    return error;
  }

  return new ConnectorError({
    code: ConnectorErrorCode.UpstreamUnavailable,
    message: "The connector could not complete the request.",
    retryable: false,
    cause: error
  });
}
