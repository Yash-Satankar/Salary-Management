import { Router } from 'express';
import { sendData } from '../../lib/http';

export function healthRoutes(checkDatabase: () => Promise<void>): Router {
  const router = Router();
  router.get('/health', async (_req, res) => {
    await checkDatabase();
    sendData(res, { status: 'ok', db: 'ok' });
  });
  return router;
}
