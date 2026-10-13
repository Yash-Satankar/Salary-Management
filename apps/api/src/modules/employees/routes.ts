import { Router } from 'express';
import { createEmployeeController } from './controller';
import type { EmployeeService } from './service';

export function employeeRoutes(service: EmployeeService): Router {
  const controller = createEmployeeController(service);
  const router = Router();
  router.get('/employees', controller.list);
  router.post('/employees', controller.create);
  router.get('/employees/:id', controller.get);
  router.patch('/employees/:id', controller.update);
  router.post('/employees/:id/terminate', controller.terminate);
  return router;
}
