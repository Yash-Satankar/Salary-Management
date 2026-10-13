import { countryCodeSchema, insightsQuerySchema } from '@acme/shared';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import { notFound } from '../../lib/errors';
import { sendData } from '../../lib/http';
import { validate } from '../../middleware/validate';
import type { ReferenceRepository } from '../reference/repository';
import type { InsightsRepository } from './repository';

export interface InsightsController {
  summary: RequestHandler;
  byCountry: RequestHandler;
  countryDetail: RequestHandler;
  byJobTitle: RequestHandler;
  byDepartment: RequestHandler;
}

export function createInsightsController(
  insights: InsightsRepository,
  reference: ReferenceRepository,
): InsightsController {
  // Every USD figure travels with the date and source of the rates that produced it.
  const fxMeta = async () => ({ fx: await reference.getFxMeta() });

  return {
    summary: validate({ query: insightsQuerySchema }, async ({ query }, _req, res) => {
      sendData(res, await insights.summary(query), { meta: await fxMeta() });
    }),

    byCountry: validate({ query: insightsQuerySchema }, async ({ query }, _req, res) => {
      sendData(res, await insights.byCountry(query), { meta: await fxMeta() });
    }),

    countryDetail: validate(
      { params: z.object({ code: countryCodeSchema }), query: insightsQuerySchema },
      async ({ params, query }, _req, res) => {
        const detail = await insights.countryDetail(params.code, query);
        if (!detail) {
          throw notFound(`Country ${params.code} not found`);
        }
        sendData(res, detail);
      },
    ),

    byJobTitle: validate(
      { params: z.object({ id: z.coerce.number().int().positive() }), query: insightsQuerySchema },
      async ({ params, query }, _req, res) => {
        if (!(await reference.findJobTitle(params.id))) {
          throw notFound(`Job title ${params.id} not found`);
        }
        sendData(res, await insights.byJobTitle(params.id, query), { meta: await fxMeta() });
      },
    ),

    byDepartment: validate({ query: insightsQuerySchema }, async ({ query }, _req, res) => {
      sendData(res, await insights.byDepartment(query), { meta: await fxMeta() });
    }),
  };
}
