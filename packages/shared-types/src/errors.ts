import { z } from 'zod';

export const ApiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.unknown()).optional(),
});

export type ApiError = z.infer<typeof ApiErrorSchema>;

// Codes d'erreur standardisés
export const ERROR_CODES = {
  // Auth
  UNAUTHORIZED: 'AUTH_001',
  FORBIDDEN: 'AUTH_002',
  TOKEN_EXPIRED: 'AUTH_003',
  // Validation
  VALIDATION_ERROR: 'VAL_001',
  // Tenant
  TENANT_NOT_FOUND: 'TEN_001',
  TENANT_INACTIVE: 'TEN_002',
  // Generic
  NOT_FOUND: 'GEN_001',
  CONFLICT: 'GEN_002',
  INTERNAL: 'GEN_999',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
