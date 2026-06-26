import type { Contact } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { SegmentationService } from '../segmentation.service';

function contact(overrides: Partial<Contact> = {}): Contact {
  const now = new Date();
  return {
    id: '00000000-0000-0000-0000-000000000001',
    agence_id: '00000000-0000-0000-0000-000000000099',
    nom: 'Test',
    prenom: null,
    genre: null,
    langue: 'fr',
    email: null,
    telephone: null,
    whatsapp: null,
    whatsapp_opt_in: false,
    adresse_ligne1: null,
    adresse_ligne2: null,
    ville: null,
    commune: null,
    pays: 'CI',
    roles: [],
    source: null,
    tags: [],
    segments_ia: [],
    score_ia: null,
    score_categorie: null,
    score_updated_at: null,
    derniere_interaction_at: null,
    created_at: now,
    updated_at: now,
    created_by: null,
    archived_at: null,
    ...overrides,
  } as Contact;
}

const svc = new SegmentationService({} as never);

describe('SegmentationService.compute', () => {
  it('VIP : score 85 + acheteur', () => {
    const segs = svc.compute(contact({ score_ia: 85, roles: ['acheteur'] }));
    expect(segs).toContain('vip');
  });

  it('VIP : score 80 + proprietaire (edge case)', () => {
    const segs = svc.compute(contact({ score_ia: 80, roles: ['proprietaire'] }));
    expect(segs).toContain('vip');
  });

  it('Pas VIP : score 85 mais prospect seul', () => {
    const segs = svc.compute(contact({ score_ia: 85, roles: ['prospect'] }));
    expect(segs).not.toContain('vip');
  });

  it('Investisseur via tag explicite', () => {
    const segs = svc.compute(contact({ tags: ['investisseur'] }));
    expect(segs).toContain('investisseur');
  });

  it('Investisseur via propriétaire avec ≥ 3 biens', () => {
    const segs = svc.compute(
      contact({ roles: ['proprietaire'] }),
      { owned_biens: 5 },
    );
    expect(segs).toContain('investisseur');
  });

  it('Pas investisseur : propriétaire avec 2 biens', () => {
    const segs = svc.compute(
      contact({ roles: ['proprietaire'] }),
      { owned_biens: 2 },
    );
    expect(segs).not.toContain('investisseur');
  });

  it('Voyageur récurrent : rôle voyageur + 3 séjours', () => {
    const segs = svc.compute(contact({ roles: ['voyageur'] }), { past_stays: 3 });
    expect(segs).toContain('voyageur_recurrent');
  });

  it('Pas voyageur récurrent sans rôle voyageur', () => {
    const segs = svc.compute(contact({ roles: ['locataire'] }), { past_stays: 5 });
    expect(segs).not.toContain('voyageur_recurrent');
  });

  it('Lead chaud : score 70 + prospect', () => {
    const segs = svc.compute(contact({ score_ia: 70, roles: ['prospect'] }));
    expect(segs).toContain('lead_chaud');
  });

  it('Pas lead chaud : score 70 mais locataire (pas prospect)', () => {
    const segs = svc.compute(contact({ score_ia: 70, roles: ['locataire'] }));
    expect(segs).not.toContain('lead_chaud');
  });

  it('À réactiver : dernière interaction > 180j + score historique 60', () => {
    const oldDate = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000);
    const segs = svc.compute(
      contact({ derniere_interaction_at: oldDate, score_ia: 30 }),
      { historical_max_score: 60 },
    );
    expect(segs).toContain('a_reactiver');
  });

  it("Pas à réactiver si dernière interaction < 180j", () => {
    const recent = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const segs = svc.compute(
      contact({ derniere_interaction_at: recent, score_ia: 30 }),
      { historical_max_score: 80 },
    );
    expect(segs).not.toContain('a_reactiver');
  });

  it('Contact qui passe de 60 → 85 + propriétaire devient VIP', () => {
    const before = svc.compute(contact({ score_ia: 60, roles: ['proprietaire'] }));
    expect(before).not.toContain('vip');
    const after = svc.compute(contact({ score_ia: 85, roles: ['proprietaire'] }));
    expect(after).toContain('vip');
  });

  it('Multiples segments cumulables : VIP + investisseur', () => {
    const segs = svc.compute(
      contact({ score_ia: 90, roles: ['proprietaire'], tags: ['investisseur'] }),
    );
    expect(segs).toContain('vip');
    expect(segs).toContain('investisseur');
  });
});
