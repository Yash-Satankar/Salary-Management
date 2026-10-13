import express from 'express';
import { pino } from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createErrorHandler } from './error-handler';
import { validate } from './validate';

function appWith(handler: express.RequestHandler) {
  const app = express();
  app.use(express.json());
  app.post('/items/:id', handler);
  app.use(createErrorHandler(pino({ level: 'silent' })));
  return app;
}

const schemas = {
  params: z.object({ id: z.coerce.number().int().positive() }),
  query: z.object({ dryRun: z.enum(['true', 'false']).default('false') }),
  body: z.object({ name: z.string().min(2) }),
};

describe('validate', () => {
  it('passes parsed, typed input to the handler', async () => {
    const app = appWith(
      validate(schemas, ({ params, query, body }, _req, res) => {
        res.json({ id: params.id, dryRun: query.dryRun, name: body.name });
      }),
    );
    const response = await request(app).post('/items/7?dryRun=true').send({ name: 'Asha' });
    expect(response.body).toEqual({ id: 7, dryRun: 'true', name: 'Asha' });
  });

  it('responds 400 with Zod-flattened field errors', async () => {
    const app = appWith(validate(schemas, (_input, _req, res) => res.json({})));
    const response = await request(app).post('/items/7').send({ name: 'A' });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details.fieldErrors).toEqual({
      name: [expect.stringContaining('2')],
    });
  });

  it('validates route params', async () => {
    const app = appWith(validate(schemas, (_input, _req, res) => res.json({})));
    const response = await request(app).post('/items/abc').send({ name: 'Asha' });
    expect(response.status).toBe(400);
    expect(response.body.error.details.fieldErrors).toHaveProperty('id');
  });
});
