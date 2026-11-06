/**
 * Application error taxonomy.
 *
 * Services throw these instead of returning untyped errors, so Server Actions
 * and Route Handlers can map them to a user-facing message (translated through
 * `messageKey`) and an HTTP status without leaking internals.
 */

export type AppErrorCode =
  | "VALIDATION_FAILED"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "LOCATION_FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "OUT_OF_STOCK"
  | "RATE_LIMITED"
  | "PAYMENT_FAILED"
  | "COURIER_FAILED"
  | "INTERNAL";

const STATUS_BY_CODE: Record<AppErrorCode, number> = {
  VALIDATION_FAILED: 422,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  LOCATION_FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  OUT_OF_STOCK: 409,
  RATE_LIMITED: 429,
  PAYMENT_FAILED: 502,
  COURIER_FAILED: 502,
  INTERNAL: 500,
};

export interface AppErrorOptions {
  /** i18n key used to show this error to the customer or staff member. */
  messageKey?: string;
  /** Structured details (e.g. which line items were short on stock). */
  details?: Record<string, unknown>;
  cause?: unknown;
}

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly httpStatus: number;
  readonly messageKey: string | undefined;
  readonly details: Record<string, unknown> | undefined;

  constructor(code: AppErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "AppError";
    this.code = code;
    this.httpStatus = STATUS_BY_CODE[code];
    this.messageKey = options.messageKey;
    this.details = options.details;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/** Shape returned to the client by Server Actions and Route Handlers. */
export interface SerializedAppError {
  code: AppErrorCode;
  messageKey: string | undefined;
  details: Record<string, unknown> | undefined;
}

/** Never expose stack traces or raw messages of unknown errors to the client. */
export function serializeError(error: unknown): SerializedAppError {
  if (isAppError(error)) {
    return { code: error.code, messageKey: error.messageKey, details: error.details };
  }
  return { code: "INTERNAL", messageKey: "errors.internal", details: undefined };
}
