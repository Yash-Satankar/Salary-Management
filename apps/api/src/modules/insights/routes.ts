import { Router } from 'express';
import type { ReferenceRepository } from '../reference/repository';
import { createInsightsController } from './controller';
import type { InsightsRepository } from './repository';

export function insightsRoutes(
  insights: InsightsRepository,
  reference: ReferenceRepository,
): Router {
  const controller = createInsightsController(insights, reference);
  const router = Router();
  router.get('/insights/summary', controller.summary);
  router.get('/insights/by-country', controller.byCountry);
  router.get('/insights/by-country/:code', controller.countryDetail);
  router.get('/insights/by-job-title/:id', controller.byJobTitle);
  router.get('/insights/by-department', controller.byDepartment);
  return router;
}
