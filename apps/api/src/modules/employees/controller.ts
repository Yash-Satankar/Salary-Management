import {
  employeeCreateSchema,
  employeeListQuerySchema,
  employeeUpdateSchema,
  terminateEmployeeSchema,
} from '@acme/shared';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import { sendData } from '../../lib/http';
import { validate } from '../../middleware/validate';
import type { EmployeeService } from './service';

const idParams = z.object({ id: z.coerce.number().int().positive() });

export interface EmployeeController {
  list: RequestHandler;
  get: RequestHandler;
  create: RequestHandler;
  update: RequestHandler;
  terminate: RequestHandler;
}

/** HTTP only: parse, delegate to the service, wrap in the envelope. */
export function createEmployeeController(service: EmployeeService): EmployeeController {
  const withFx = async () => ({ fx: await service.fxMeta() });

  return {
    list: validate({ query: employeeListQuerySchema }, async ({ query }, _req, res) => {
      const { items, meta } = await service.list(query);
      sendData(res, items, { meta });
    }),

    get: validate({ params: idParams }, async ({ params }, _req, res) => {
      sendData(res, await service.getDetail(params.id), { meta: await withFx() });
    }),

    create: validate({ body: employeeCreateSchema }, async ({ body }, _req, res) => {
      sendData(res, await service.create(body), { status: 201, meta: await withFx() });
    }),

    update: validate(
      { params: idParams, body: employeeUpdateSchema },
      async ({ params, body }, _req, res) => {
        sendData(res, await service.update(params.id, body), { meta: await withFx() });
      },
    ),

    terminate: validate(
      { params: idParams, body: terminateEmployeeSchema },
      async ({ params, body }, _req, res) => {
        sendData(res, await service.terminate(params.id, body), { meta: await withFx() });
      },
    ),
  };
}
