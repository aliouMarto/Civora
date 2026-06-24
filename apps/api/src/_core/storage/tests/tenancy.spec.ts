/**
 * Tests d'isolation tenant sur les clés de stockage.
 * Vérifie buildObjectKey, keyBelongsToAgence, politique de validation.
 */
import { describe, it, expect } from 'vitest';

import { buildObjectKey, keyBelongsToAgence } from '../object-key';
import {
  validateContentType,
  validateFileSize,
  STORAGE_POLICIES,
} from '../storage-policy';

describe('buildObjectKey()', () => {
  it('génère une clé avec le bon préfixe tenant', () => {
    const key = buildObjectKey({
      agence_id: 'agence-123',
      kind: 'bail',
      ext: 'pdf',
    });
    expect(key).toMatch(/^tenants\/agence-123\/bail\/\d{4}\/\d{2}\/[0-9a-f-]+\.pdf$/);
  });

  it('inclut entite_id si fourni', () => {
    const key = buildObjectKey({
      agence_id: 'agence-123',
      entite_id: 'entite-456',
      kind: 'photo_bien',
      ext: 'jpg',
    });
    expect(key).toMatch(/^tenants\/agence-123\/entite-456\/photo_bien\//);
  });

  it('normalise l\'extension (retire le point initial, met en minuscule)', () => {
    const key = buildObjectKey({ agence_id: 'ag', kind: 'bail', ext: '.PDF' });
    expect(key).toMatch(/\.pdf$/);
  });

  it('utilise la date fournie pour le partitionnement yyyy/mm', () => {
    const key = buildObjectKey({
      agence_id: 'ag',
      kind: 'bail',
      ext: 'pdf',
      now: new Date('2025-06-15T00:00:00Z'),
    });
    expect(key).toContain('/2025/06/');
  });

  it('chaque clé générée est unique (UUID différent)', () => {
    const key1 = buildObjectKey({ agence_id: 'ag', kind: 'bail', ext: 'pdf' });
    const key2 = buildObjectKey({ agence_id: 'ag', kind: 'bail', ext: 'pdf' });
    expect(key1).not.toBe(key2);
  });
});

describe('keyBelongsToAgence()', () => {
  it('retourne true pour la clé de la bonne agence', () => {
    expect(
      keyBelongsToAgence('tenants/agence-abc/bail/2025/06/uuid.pdf', 'agence-abc'),
    ).toBe(true);
  });

  it('retourne false pour une autre agence', () => {
    expect(
      keyBelongsToAgence('tenants/agence-xyz/bail/2025/06/uuid.pdf', 'agence-abc'),
    ).toBe(false);
  });

  it('retourne false pour un préfixe partiel identique (sécurité)', () => {
    // "agence-abc" est préfixe de "agence-abc-evil" — on doit refuser
    expect(
      keyBelongsToAgence('tenants/agence-abc-evil/bail/2025/06/uuid.pdf', 'agence-abc'),
    ).toBe(false);
  });

  it('retourne false pour une clé sans préfixe tenants/', () => {
    expect(keyBelongsToAgence('agence-abc/bail/uuid.pdf', 'agence-abc')).toBe(false);
  });
});

describe('Politique de validation par kind', () => {
  describe('validateContentType()', () => {
    it('autorise image/jpeg pour photo_bien', () => {
      expect(validateContentType('photo_bien', 'image/jpeg')).toBe(true);
    });

    it('refuse application/pdf pour photo_bien', () => {
      expect(validateContentType('photo_bien', 'application/pdf')).toBe(false);
    });

    it('autorise uniquement application/pdf pour bail', () => {
      expect(validateContentType('bail', 'application/pdf')).toBe(true);
      expect(validateContentType('bail', 'image/jpeg')).toBe(false);
    });

    it('refuse application/octet-stream pour tous les kinds', () => {
      for (const kind of Object.keys(STORAGE_POLICIES)) {
        expect(validateContentType(kind as never, 'application/octet-stream')).toBe(false);
      }
    });
  });

  describe('validateFileSize()', () => {
    it('accepte un fichier dans la limite', () => {
      expect(validateFileSize('bail', 10 * 1024 * 1024)).toBe(true); // 10 Mo < 20 Mo
    });

    it('rejette un fichier au-dessus de la limite', () => {
      expect(validateFileSize('bail', 21 * 1024 * 1024)).toBe(false); // 21 Mo > 20 Mo
    });

    it('accepte un fichier exactement à la limite', () => {
      const maxBail = STORAGE_POLICIES.bail.maxSizeBytes;
      expect(validateFileSize('bail', maxBail)).toBe(true);
    });

    it('rejette un fichier dépassant d\'un octet', () => {
      const maxBail = STORAGE_POLICIES.bail.maxSizeBytes;
      expect(validateFileSize('bail', maxBail + 1)).toBe(false);
    });
  });

  describe('Politiques cohérentes', () => {
    it('payments critique : bail a plus de capacité que photo_bien', () => {
      expect(STORAGE_POLICIES.bail.maxSizeBytes).toBeGreaterThan(
        STORAGE_POLICIES.photo_bien.maxSizeBytes,
      );
    });

    it('rapport a la plus grande capacité', () => {
      const maxRapport = STORAGE_POLICIES.rapport.maxSizeBytes;
      for (const [kind, cfg] of Object.entries(STORAGE_POLICIES)) {
        if (kind !== 'rapport') {
          expect(cfg.maxSizeBytes).toBeLessThanOrEqual(maxRapport);
        }
      }
    });
  });
});
