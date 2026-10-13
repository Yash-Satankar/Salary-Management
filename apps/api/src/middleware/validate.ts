import type { Request, RequestHandler, Response } from 'express';
import { z } from 'zod';
import { validationError } from '../lib/errors';

export interface RequestSchemas {
  params?: z.ZodType;
  query?: z.ZodType;
  body?: z.ZodType;
}

type Parsed<T> = T extends z.ZodType ? z.output<T> : undefined;

export interface ValidatedInput<S extends RequestSchemas> {
  params: Parsed<S['params']>;
  query: Parsed<S['query']>;
  body: Parsed<S['body']>;
}

/**
 * Parses params, query and body before the handler runs and hands it typed values. Express 5's
 * `req.query` is read-only, so parsed input is passed as an argument instead of written back.
 */
export function validate<S extends RequestSchemas>(
  schemas: S,
  handler: (input: ValidatedInput<S>, req: Request, res: Response) => unknown,
): RequestHandler {
  return async (req, res) => {
    const input = {
      params: parse(schemas.params, req.params),
      query: parse(schemas.query, req.query),
      body: parse(schemas.body, req.body),
    } as ValidatedInput<S>;
    await handler(input, req, res);
  };
}

function parse(schema: z.ZodType | undefined, value: unknown): unknown {
  if (!schema) {
    return undefined;
  }
  const result = schema.safeParse(value);
  if (!result.success) {
    throw validationError(z.flattenError(result.error));
  }
  return result.data;
}
