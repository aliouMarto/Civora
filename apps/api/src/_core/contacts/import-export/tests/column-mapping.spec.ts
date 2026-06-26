import { describe, it, expect } from 'vitest';

import {
  inverseMapping,
  mapRowToDto,
  normalizeHeader,
  suggestMapping,
} from '../column-mapping';

describe('column-mapping — heuristique', () => {
  it('normalizeHeader retire accents, casse, espaces, ponctuation', () => {
    expect(normalizeHeader('Prénom')).toBe('prenom');
    expect(normalizeHeader('E-Mail')).toBe('email');
    expect(normalizeHeader('Nom de famille')).toBe('nomdefamille');
    expect(normalizeHeader('Téléphone (GSM)')).toBe('telephonegsm');
  });

  it('CSV anglais (firstname/lastname/email/phone)', () => {
    const headers = ['Firstname', 'Lastname', 'Email', 'Phone'];
    const r = suggestMapping(headers);
    expect(r.mapping.nom).toBe('Lastname');
    expect(r.mapping.prenom).toBe('Firstname');
    expect(r.mapping.email).toBe('Email');
    expect(r.mapping.telephone).toBe('Phone');
  });

  it('CSV français (nom/prenom/courriel/portable)', () => {
    const headers = ['Nom', 'Prénom', 'Courriel', 'Portable', 'Ville'];
    const r = suggestMapping(headers);
    expect(r.mapping.nom).toBe('Nom');
    expect(r.mapping.prenom).toBe('Prénom');
    expect(r.mapping.email).toBe('Courriel');
    expect(r.mapping.telephone).toBe('Portable');
    expect(r.mapping.ville).toBe('Ville');
  });

  it('XLSX bien formé (UTF-8 BOM toléré au niveau du parser, pas ici)', () => {
    const headers = ['nom', 'prenom', 'email', 'telephone', 'commune'];
    const r = suggestMapping(headers);
    expect(Object.keys(r.mapping).sort()).toEqual(['commune', 'email', 'nom', 'prenom', 'telephone']);
    expect(r.unmatched).toEqual([]);
  });

  it('XLSX avec colonnes inconnues → unmatched populé', () => {
    const headers = ['nom', 'email', 'Couleur_pref', 'Sport_favori'];
    const r = suggestMapping(headers);
    expect(r.unmatched.sort()).toEqual(['Couleur_pref', 'Sport_favori']);
  });

  it('Heuristique fallback : colonne contenant des emails est suggérée comme email', () => {
    const headers = ['nom', 'Champ_X'];
    const sample = [
      { nom: 'A', Champ_X: 'a@example.com' },
      { nom: 'B', Champ_X: 'b@example.com' },
    ];
    const r = suggestMapping(headers, sample);
    expect(r.mapping.email).toBe('Champ_X');
  });

  it('Heuristique fallback : colonne contenant des +225... est suggérée comme telephone', () => {
    const headers = ['nom', 'Champ_Y'];
    const sample = [
      { nom: 'A', Champ_Y: '+2250707070707' },
      { nom: 'B', Champ_Y: '+2250707070708' },
    ];
    const r = suggestMapping(headers, sample);
    expect(r.mapping.telephone).toBe('Champ_Y');
  });

  it('mapRowToDto : roles avec séparateur point-virgule splittés', () => {
    const inverse = inverseMapping({ nom: 'Nom', roles: 'Types' });
    const dto = mapRowToDto({ Nom: 'Kouassi', Types: 'prospect;acheteur' }, inverse);
    expect(dto['nom']).toBe('Kouassi');
    expect(dto['roles']).toEqual(['prospect', 'acheteur']);
  });

  it('mapRowToDto : whatsapp_opt_in reconnaît oui/yes/1/true', () => {
    const inverse = inverseMapping({ whatsapp_opt_in: 'WA' });
    expect(mapRowToDto({ WA: 'oui' }, inverse)['whatsapp_opt_in']).toBe(true);
    expect(mapRowToDto({ WA: 'yes' }, inverse)['whatsapp_opt_in']).toBe(true);
    expect(mapRowToDto({ WA: '1' }, inverse)['whatsapp_opt_in']).toBe(true);
    expect(mapRowToDto({ WA: 'true' }, inverse)['whatsapp_opt_in']).toBe(true);
    expect(mapRowToDto({ WA: 'non' }, inverse)['whatsapp_opt_in']).toBe(false);
    expect(mapRowToDto({ WA: '0' }, inverse)['whatsapp_opt_in']).toBe(false);
  });

  it('mapRowToDto : pays upper-cased et limité à 2 caractères', () => {
    const inverse = inverseMapping({ pays: 'pays' });
    expect(mapRowToDto({ pays: 'ci' }, inverse)['pays']).toBe('CI');
    expect(mapRowToDto({ pays: 'France' }, inverse)['pays']).toBe('FR');
  });

  it('mapRowToDto : email lowercased', () => {
    const inverse = inverseMapping({ email: 'Mail' });
    expect(mapRowToDto({ Mail: 'Sory.K@Example.CI' }, inverse)['email']).toBe('sory.k@example.ci');
  });

  it('mapRowToDto : cellules vides ignorées (pas de string vide poussée à zod)', () => {
    const inverse = inverseMapping({ nom: 'Nom', prenom: 'Prenom' });
    const dto = mapRowToDto({ Nom: 'Test', Prenom: '   ' }, inverse);
    expect(dto['nom']).toBe('Test');
    expect(dto['prenom']).toBeUndefined();
  });
});
