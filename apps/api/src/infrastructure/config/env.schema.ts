import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().url({ message: 'DATABASE_URL must be a valid PostgreSQL URL' }),
  REDIS_URL: z.string().url({ message: 'REDIS_URL must be a valid Redis URL' }),
  GOTENBERG_URL: z.string().url({ message: 'GOTENBERG_URL must be a valid URL' }),
});

export type Env = z.infer<typeof envSchema>;
