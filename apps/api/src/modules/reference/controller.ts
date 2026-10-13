import type { RequestHandler } from 'express';
import { sendData } from '../../lib/http';
import type { ReferenceRepository } from './repository';

export function createReferenceController(repository: ReferenceRepository): {
  get: RequestHandler;
} {
  return {
    get: async (_req, res) => {
      sendData(res, await repository.getReferenceData());
    },
  };
}
