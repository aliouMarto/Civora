import { parsePhoneNumberWithError, isValidPhoneNumber, type CountryCode } from 'libphonenumber-js';

/**
 * Normalise un numéro de téléphone en E.164 (+225XXXXXXXX).
 *
 * - Si la chaîne est déjà en E.164 valide → retournée telle quelle.
 * - Si la chaîne est en format local (ex: "0707070707") → préfixée avec
 *   le code pays par défaut (CI pour Côte d'Ivoire).
 * - Si invalide → lève PhoneNormalizationError.
 *
 * Cette fonction est idempotente : normalize(normalize(x)) === normalize(x).
 */
export class PhoneNormalizationError extends Error {
  constructor(public readonly input: string, public readonly reason: string) {
    super(`Téléphone invalide "${input}" : ${reason}`);
    this.name = 'PhoneNormalizationError';
  }
}

const DEFAULT_COUNTRY: CountryCode = 'CI';

export function normalizePhone(input: string, defaultCountry: CountryCode = DEFAULT_COUNTRY): string {
  const trimmed = input.trim().replace(/\s+/g, '');
  if (trimmed.length === 0) {
    throw new PhoneNormalizationError(input, 'chaîne vide');
  }

  try {
    const parsed = parsePhoneNumberWithError(trimmed, defaultCountry);
    if (!parsed.isValid()) {
      throw new PhoneNormalizationError(input, 'numéro non valide pour le pays');
    }
    return parsed.number; // format E.164 (ex: +2250707070707)
  } catch (err) {
    if (err instanceof PhoneNormalizationError) throw err;
    throw new PhoneNormalizationError(input, (err as Error).message);
  }
}

/**
 * Version safe qui retourne null au lieu de throw — utile pour les filtres.
 */
export function tryNormalizePhone(input: string | null | undefined, defaultCountry: CountryCode = DEFAULT_COUNTRY): string | null {
  if (!input) return null;
  try {
    return normalizePhone(input, defaultCountry);
  } catch {
    return null;
  }
}

/**
 * Validation pure sans normalisation (E.164 strict).
 */
export function isValidE164(input: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(input) && isValidPhoneNumber(input);
}
