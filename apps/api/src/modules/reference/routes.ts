import { Router } from 'express';
import { createReferenceController } from './controller';
import type { ReferenceRepository } from './repository';

export function referenceRoutes(repository: ReferenceRepository): Router {
  const controller = createReferenceController(repository);
  const router = Router();
  router.get('/reference', controller.get);
  return router;
}
