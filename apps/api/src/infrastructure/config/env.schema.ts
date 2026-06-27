import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  // Rôle propriétaire des tables — UNIQUEMENT pour les migrations Prisma.
  // L'API applicative ne doit JAMAIS s'en servir : il contourne la RLS.
  DATABASE_URL: z.string().url({ message: 'DATABASE_URL must be a valid PostgreSQL URL' }),
  // Rôle applicatif (civora_app) — soumis à la RLS. Utilisé par PrismaService.
  DATABASE_APP_URL: z.string().url({ message: 'DATABASE_APP_URL must be a valid PostgreSQL URL' }),
  // Rôle admin (civora_admin) avec BYPASSRLS — workers système uniquement.
  DATABASE_ADMIN_URL: z.string().url({ message: 'DATABASE_ADMIN_URL must be a valid PostgreSQL URL' }),
  REDIS_URL: z.string().url({ message: 'REDIS_URL must be a valid Redis URL' }),
  GOTENBERG_URL: z.string().url({ message: 'GOTENBERG_URL must be a valid URL' }),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 chars'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 chars'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_DAYS: z.coerce.number().int().positive().default(14),
  OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(200),
  // ── SMTP (email) ─────────────────────────────────────────────────────────
  // ── Observabilité ─────────────────────────────────────────────────────────
  SENTRY_DSN: z.string().url().optional(),
  // ── IA — Passerelle générative ───────────────────────────────────────────
  AI_PROVIDER_MODE: z.enum(['auto', 'fake', 'openai', 'gemini']).default('fake'),
  OPENAI_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  /** URL du service IA prédictif Python (FastAPI). Si absent, fallback heuristique TS. */
  AI_SERVICE_URL: z.string().url().optional(),
  // ── SMTP (email) ─────────────────────────────────────────────────────────
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_SECURE: z.coerce.boolean().default(false),
  SMTP_FROM: z.string().default('Civora <no-reply@civora.io>'),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  // ── Mapbox (carte + reverse-geocoding) ────────────────────────────────────
  // Token PUBLIC (scope pk.*) : utilisé côté client pour le rendu de la carte.
  // Token SECRET (scope sk.*) : utilisé côté serveur pour la Geocoding API.
  MAPBOX_TOKEN_PUBLIC: z.string().optional(),
  MAPBOX_TOKEN_SECRET: z.string().optional(),
  // ── Stockage R2 (production) ──────────────────────────────────────────────
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  // ── MinIO (dev / test) ────────────────────────────────────────────────────
  MINIO_ENDPOINT: z.string().url().optional(),
  MINIO_ACCESS_KEY: z.string().optional(),
  MINIO_SECRET_KEY: z.string().optional(),
  MINIO_BUCKET: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;
