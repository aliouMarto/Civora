/**
 * Tests de validation ligne par ligne — vérifie que les lignes invalides
 * (email mal formé, téléphone non E.164, canal absent) sont rejetées
 * proprement et que les lignes valides passent.
 *
 * On instancie ContactsImportService directement avec des stubs minimaux
 * pour tester `validateRow` sans dépendre de l'infra (DB, R2, BullMQ).
 */
import { describe, it, expect } from 'vitest';

import { ContactsImportService } from '../contacts-import.service';

function makeService(): ContactsImportService {
  // Stubs : on n'utilise que validateRow, donc on peut passer des nulls.
  return new ContactsImportService(
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
  );
}

describe('ContactsImportService — validation ligne par ligne', () => {
  const svc = makeService();

  it('ligne valide (nom + email) → 0 erreur', async () => {
    const errors = await svc.validateRow({
      nom: 'Kouassi',
      email: 'sory@example.ci',
    });
    expect(errors).toEqual([]);
  });

  it('ligne valide (nom + téléphone E.164) → 0 erreur', async () => {
    const errors = await svc.validateRow({
      nom: 'Bamba',
      telephone: '+2250707070707',
    });
    expect(errors).toEqual([]);
  });

  it('email malformé → erreur', async () => {
    const errors = await svc.validateRow({
      nom: 'Test',
      email: 'pas-un-email',
      telephone: '+2250707070707',
    });
    expect(errors.some((e) => /email/i.test(e))).toBe(true);
  });

  it('téléphone non E.164 et non normalisable → erreur', async () => {
    const errors = await svc.validateRow({
      nom: 'Test',
      telephone: 'abc-xyz-not-a-phone',
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('ni email ni téléphone → erreur explicite "au moins un canal"', async () => {
    const errors = await svc.validateRow({ nom: 'Solo' });
    expect(errors.some((e) => e.includes('email OU telephone'))).toBe(true);
  });

  it('téléphone local "0707070707" normalisé en E.164 et accepté', async () => {
    const errors = await svc.validateRow({
      nom: 'LocalNum',
      telephone: '0707070707', // sera normalisé en +2250707070707
    });
    expect(errors).toEqual([]);
  });

  it('rôle inconnu → erreur (enum fermée)', async () => {
    const errors = await svc.validateRow({
      nom: 'Test',
      email: 'a@b.io',
      roles: ['inconnu_role'],
    });
    expect(errors.some((e) => /role/i.test(e))).toBe(true);
  });
});
