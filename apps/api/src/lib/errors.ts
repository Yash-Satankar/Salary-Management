import type { ErrorCode } from '@acme/shared';

export const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNPROCESSABLE: 422,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

/** An error that is safe to show to the client; anything else becomes a generic 500. */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }

  get status(): number {
    return STATUS_BY_CODE[this.code];
  }
}

export const validationError = (details?: unknown, message = 'Request validation failed') =>
  new AppError('VALIDATION_ERROR', message, details);
export const unauthenticated = (message = 'Authentication required') =>
  new AppError('UNAUTHENTICATED', message);
export const forbidden = (message: string) => new AppError('FORBIDDEN', message);
export const notFound = (message: string) => new AppError('NOT_FOUND', message);
export const conflict = (message: string, details?: unknown) =>
  new AppError('CONFLICT', message, details);
export const unprocessable = (message: string, details?: unknown) =>
  new AppError('UNPROCESSABLE', message, details);
export const payloadTooLarge = (message: string) => new AppError('PAYLOAD_TOO_LARGE', message);
export const rateLimited = (message = 'Too many requests, please try again later') =>
  new AppError('RATE_LIMITED', message);
export const internalError = () => new AppError('INTERNAL', 'Something went wrong');
