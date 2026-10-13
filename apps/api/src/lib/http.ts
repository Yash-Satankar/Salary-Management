import type { Response } from 'express';

interface SendOptions {
  status?: number;
  meta?: unknown;
}

/** Writes the success envelope `{ data, meta? }` used by every endpoint. */
export function sendData(res: Response, data: unknown, { status = 200, meta }: SendOptions = {}) {
  res.status(status).json(meta === undefined ? { data } : { data, meta });
}
