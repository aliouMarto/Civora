import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().url({ message: 'DATABASE_URL must be a valid PostgreSQL URL' }),
  DATABASE_APP_URL: z.string().url().optional(),
  DATABASE_ADMIN_URL: z.string().url().optional(),
  REDIS_URL: z.string().url({ message: 'REDIS_URL must be a valid Redis URL' }),
  GOTENBERG_URL: z.string().url({ message: 'GOTENBERG_URL must be a valid URL' }),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 chars'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 chars'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_DAYS: z.coerce.number().int().positive().default(14),
  OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(200),
});

export type Env = z.infer<typeof envSchema>;
