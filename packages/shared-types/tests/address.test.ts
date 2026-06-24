import { describe, it, expect } from 'vitest';

import { validateAddress, validateGeoPoint } from '../src/address';

describe('GeoPoint', () => {
  it('valide un point correct', () => {
    const pt = validateGeoPoint({ lat: 5.354, lng: -4.008 });
    expect(pt.lat).toBeCloseTo(5.354);
  });

  it('rejette une latitude hors bornes', () => {
    expect(() => validateGeoPoint({ lat: 91, lng: 0 })).toThrow();
  });

  it('rejette une longitude hors bornes', () => {
    expect(() => validateGeoPoint({ lat: 0, lng: 181 })).toThrow();
  });
});

describe('Address', () => {
  it('valide une adresse complète', () => {
    const addr = validateAddress({
      line1: 'Rue des Jardins',
      city: 'Abidjan',
      commune: 'Cocody',
      country: 'CI',
      geo: { lat: 5.354, lng: -4.008 },
    });
    expect(addr.city).toBe('Abidjan');
    expect(addr.geo?.lat).toBeCloseTo(5.354);
  });

  it('valide une adresse minimale sans geo', () => {
    const addr = validateAddress({ line1: '10 rue X', city: 'Dakar', country: 'SN' });
    expect(addr.geo).toBeUndefined();
  });

  it('rejette un pays avec plus de 2 caractères', () => {
    expect(() =>
      validateAddress({ line1: 'X', city: 'Abidjan', country: 'CIV' }),
    ).toThrow();
  });

  it('rejette une line1 vide', () => {
    expect(() =>
      validateAddress({ line1: '', city: 'Abidjan', country: 'CI' }),
    ).toThrow();
  });
});
