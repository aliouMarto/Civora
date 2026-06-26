import { describe, expect, it } from 'vitest';

import {
  isValidE164,
  normalizePhone,
  PhoneNormalizationError,
  tryNormalizePhone,
} from '../normalizers/phone.normalizer';

describe('phone.normalizer', () => {
  describe('normalizePhone', () => {
    it('passe une chaîne E.164 valide telle quelle', () => {
      expect(normalizePhone('+2250707070707')).toBe('+2250707070707');
    });

    it('normalise un numéro local CI vers E.164', () => {
      expect(normalizePhone('0707070707', 'CI')).toBe('+2250707070707');
    });

    it('normalise un numéro local FR vers E.164', () => {
      expect(normalizePhone('0612345678', 'FR')).toBe('+33612345678');
    });

    it('est idempotent', () => {
      const first = normalizePhone('0707070707', 'CI');
      const second = normalizePhone(first, 'CI');
      expect(second).toBe(first);
    });

    it('supprime les espaces', () => {
      expect(normalizePhone('+225 07 07 07 07 07')).toBe('+2250707070707');
    });

    it('rejette une chaîne vide', () => {
      expect(() => normalizePhone('')).toThrow(PhoneNormalizationError);
    });

    it('rejette un numéro impossible (trop court)', () => {
      expect(() => normalizePhone('+225123')).toThrow(PhoneNormalizationError);
    });

    it("rejette un numéro sans préfixe quand le pays par défaut ne s'applique pas", () => {
      expect(() => normalizePhone('123', 'CI')).toThrow(PhoneNormalizationError);
    });
  });

  describe('tryNormalizePhone', () => {
    it('retourne null pour null/undefined/empty', () => {
      expect(tryNormalizePhone(null)).toBeNull();
      expect(tryNormalizePhone(undefined)).toBeNull();
      expect(tryNormalizePhone('')).toBeNull();
    });

    it('retourne null pour un numéro invalide', () => {
      expect(tryNormalizePhone('abc')).toBeNull();
    });

    it('retourne la version normalisée pour un numéro valide', () => {
      expect(tryNormalizePhone('0707070707', 'CI')).toBe('+2250707070707');
    });
  });

  describe('isValidE164', () => {
    it('accepte un E.164 valide', () => {
      expect(isValidE164('+2250707070707')).toBe(true);
    });

    it('refuse les formats locaux', () => {
      expect(isValidE164('0707070707')).toBe(false);
    });

    it('refuse les chaînes avec espaces', () => {
      expect(isValidE164('+225 0707070707')).toBe(false);
    });

    it('refuse une chaîne aléatoire', () => {
      expect(isValidE164('not-a-phone')).toBe(false);
    });
  });
});
