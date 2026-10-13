import { z } from 'zod';

export const importRowErrorSchema = z.object({
  /** 1-based line number in the file, counting the header as line 1. */
  row: z.number().int().positive(),
  field: z.string().optional(),
  message: z.string(),
});
export type ImportRowError = z.infer<typeof importRowErrorSchema>;

export const importResultSchema = z.object({
  dryRun: z.boolean(),
  totalRows: z.number().int().nonnegative(),
  toCreate: z.number().int().nonnegative(),
  toUpdate: z.number().int().nonnegative(),
  unchanged: z.number().int().nonnegative(),
  errors: z.array(importRowErrorSchema),
});
export type ImportResult = z.infer<typeof importResultSchema>;

export const importResultResponseSchema = z.object({ data: importResultSchema });

export const importQuerySchema = z.object({
  dryRun: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
});
