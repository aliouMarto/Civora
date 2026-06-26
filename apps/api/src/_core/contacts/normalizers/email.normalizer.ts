/**
 * Normalise un email : trim + lowercase.
 * Idempotent. Ne valide pas le format (laisser à class-validator/zod).
 */
export function normalizeEmail(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}
