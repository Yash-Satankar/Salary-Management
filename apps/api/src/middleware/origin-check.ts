import type { RequestHandler } from 'express';
import { forbidden, validationError } from '../lib/errors';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export interface OriginCheckOptions {
  allowedOrigins: string[];
  /** Paths (relative to the mount point) that accept multipart uploads instead of JSON. */
  multipartPaths?: string[];
}

/**
 * CSRF defence for cookie sessions. A cross-site page cannot send `application/json` without a
 * CORS preflight (which this API never approves), and browsers send `Origin` on cross-site
 * POSTs, so each check on its own stops a forged request.
 */
export function originCheck({
  allowedOrigins,
  multipartPaths = [],
}: OriginCheckOptions): RequestHandler {
  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method)) {
      next();
      return;
    }
    const origin = req.headers.origin;
    if (origin !== undefined && !allowedOrigins.includes(origin)) {
      throw forbidden('Origin not allowed');
    }
    const acceptsMultipart = multipartPaths.includes(req.path);
    if (!req.is('application/json') && !(acceptsMultipart && req.is('multipart/form-data'))) {
      throw validationError(
        undefined,
        acceptsMultipart
          ? 'Content-Type must be multipart/form-data'
          : 'Content-Type must be application/json',
      );
    }
    next();
  };
}
