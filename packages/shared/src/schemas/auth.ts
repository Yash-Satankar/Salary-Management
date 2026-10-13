import { z } from 'zod';
import { emailSchema } from './common';

export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required').max(200),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const meResponseSchema = z.object({
  data: z.object({ email: z.string() }),
});
export type MeResponse = z.infer<typeof meResponseSchema>;
