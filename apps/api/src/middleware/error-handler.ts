import type { ErrorRequestHandler, RequestHandler } from 'express';
import { MulterError } from 'multer';
import type { Logger } from 'pino';
import { z } from 'zod';
import { AppError, internalError, notFound, payloadTooLarge, validationError } from '../lib/errors';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(notFound(`Route ${req.method} ${req.originalUrl} not found`));
};

export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  return (error: unknown, req, res, _next) => {
    const appError = toAppError(error);
    if (appError.code === 'INTERNAL') {
      logger.error({ err: error, method: req.method, path: req.originalUrl }, 'Unhandled error');
    }
    const { code, message, details } = appError;
    res
      .status(appError.status)
      .json({ error: details === undefined ? { code, message } : { code, message, details } });
  };
}

function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }
  if (error instanceof MulterError) {
    return error.code === 'LIMIT_FILE_SIZE'
      ? payloadTooLarge('The file is larger than 5 MB')
      : validationError(undefined, `Upload rejected: ${error.message}`);
  }
  if (error instanceof z.ZodError) {
    return validationError(z.flattenError(error));
  }
  if (isBodyParserError(error)) {
    return error.type === 'entity.too.large'
      ? payloadTooLarge('Request body is too large')
      : validationError(undefined, 'Request body is not valid JSON');
  }
  return internalError();
}

function isBodyParserError(error: unknown): error is { type: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    typeof error.type === 'string' &&
    error.type.startsWith('entity.')
  );
}
