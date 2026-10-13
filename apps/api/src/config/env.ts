import { z } from 'zod';

const originSchema = z
  .url()
  .refine(
    (value) => URL.canParse(value) && new URL(value).origin === value,
    'Must be a bare origin such as https://app.example.com',
  );

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  HR_EMAIL: z.string().trim().toLowerCase().pipe(z.email()),
  HR_PASSWORD_HASH: z
    .string()
    .regex(/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/, 'Must be a bcrypt hash'),
  SESSION_SECRET: z.string().min(32, 'Must be at least 32 characters'),
  ALLOWED_ORIGINS: z
    .string()
    .min(1)
    .transform((value) => value.split(',').map((origin) => origin.trim().replace(/\/$/, '')))
    .pipe(z.array(originSchema)),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export type Env = z.infer<typeof envSchema>;

/** Validates configuration once at boot so a misconfigured deploy fails immediately and loudly. */
export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  return result.data;
}
