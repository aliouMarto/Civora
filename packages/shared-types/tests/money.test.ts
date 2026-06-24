import { describe, it, expect } from 'vitest';

import { Money } from '../src/money';

describe('Money — construction', () => {
  it('crée un Money XOF via ofXOF', () => {
    const m = Money.ofXOF(100_000n);
    expect(m.amount).toBe(100_000n);
    expect(m.currency).toBe('XOF');
  });

  it('crée un Money via of()', () => {
    const m = Money.of('EUR', 100n);
    expect(m.currency).toBe('EUR');
  });

  it('crée un Money zéro', () => {
    expect(Money.zero().isZero()).toBe(true);
    expect(Money.zero('EUR').currency).toBe('EUR');
  });

  it('refuse un number (pas bigint)', () => {
    // @ts-expect-error test volontaire
    expect(() => Money.ofXOF(100.5)).toThrow(TypeError);
  });

  it('refuse un string en tant que montant', () => {
    // @ts-expect-error test volontaire
    expect(() => Money.ofXOF('100')).toThrow(TypeError);
  });
});

describe('Money — add / subtract', () => {
  it('additionne en centimes', () => {
    const a = Money.ofXOF(100_000n);
    const b = Money.ofXOF(50_000n);
    expect(a.add(b).amount).toBe(150_000n);
  });

  it('soustrait en centimes', () => {
    const a = Money.ofXOF(100_000n);
    const b = Money.ofXOF(30_000n);
    expect(a.subtract(b).amount).toBe(70_000n);
  });

  it('la soustraction peut produire un négatif', () => {
    const a = Money.ofXOF(10n);
    const b = Money.ofXOF(50n);
    expect(a.subtract(b).isNegative()).toBe(true);
  });

  it('interdit le mélange de devises (add)', () => {
    const xof = Money.ofXOF(100_000n);
    const eur = Money.of('EUR', 100n);
    expect(() => xof.add(eur)).toThrow(/currency mismatch/i);
  });

  it('interdit le mélange de devises (subtract)', () => {
    const xof = Money.ofXOF(100_000n);
    const usd = Money.of('USD', 100n);
    expect(() => xof.subtract(usd)).toThrow(/currency mismatch/i);
  });
});

describe('Money — multiply / divide', () => {
  it('multiplie par un scalaire bigint', () => {
    const m = Money.ofXOF(10_000n);
    expect(m.multiply(3n).amount).toBe(30_000n);
  });

  it('divise par un scalaire bigint (division entière)', () => {
    const m = Money.ofXOF(10_000n);
    expect(m.divide(3n).amount).toBe(3_333n); // troncature bigint
  });

  it('lève une erreur sur division par zéro', () => {
    expect(() => Money.ofXOF(100n).divide(0n)).toThrow(/division by zero/i);
  });

  it('refuse un number comme scalaire (multiply)', () => {
    // @ts-expect-error test volontaire
    expect(() => Money.ofXOF(100n).multiply(3)).toThrow(TypeError);
  });

  it('refuse un number comme scalaire (divide)', () => {
    // @ts-expect-error test volontaire
    expect(() => Money.ofXOF(100n).divide(2)).toThrow(TypeError);
  });
});

describe('Money — comparaisons', () => {
  it('compare correctement', () => {
    const a = Money.ofXOF(100n);
    const b = Money.ofXOF(200n);
    expect(a.compare(b)).toBe(-1);
    expect(b.compare(a)).toBe(1);
    expect(a.compare(Money.ofXOF(100n))).toBe(0);
  });

  it('equals retourne true pour même montant et devise', () => {
    expect(Money.ofXOF(500n).equals(Money.ofXOF(500n))).toBe(true);
    expect(Money.ofXOF(500n).equals(Money.ofXOF(600n))).toBe(false);
    expect(Money.ofXOF(500n).equals(Money.of('EUR', 500n))).toBe(false);
  });

  it('isPositive', () => {
    expect(Money.ofXOF(1n).isPositive()).toBe(true);
    expect(Money.ofXOF(0n).isPositive()).toBe(false);
  });

  it('compare interdit devises différentes', () => {
    expect(() => Money.ofXOF(100n).compare(Money.of('EUR', 100n))).toThrow(/currency mismatch/i);
  });
});

describe('Money — format', () => {
  it('formate FCFA sans décimale', () => {
    const m = Money.ofXOF(125_000n);
    expect(m.format('fr-CI')).toMatch(/125\s?000/);
  });

  it('formate EUR avec 2 décimales', () => {
    const m = Money.of('EUR', 150_00n); // 150 EUR = 15000 centimes
    const formatted = m.format('fr-FR');
    expect(formatted).toMatch(/150/);
  });
});

describe('Money — sérialisation', () => {
  it('toJSON produit un objet avec amount en string', () => {
    const m = Money.ofXOF(999n);
    const dto = m.toJSON();
    expect(dto.amount).toBe('999');
    expect(dto.currency).toBe('XOF');
  });

  it('fromDTO reconstruit correctement', () => {
    const m = Money.fromDTO({ amount: '12345', currency: 'XOF' });
    expect(m.amount).toBe(12345n);
    expect(m.currency).toBe('XOF');
  });

  it('fromDTO rejette un montant non-entier', () => {
    expect(() => Money.fromDTO({ amount: '12.5', currency: 'XOF' })).toThrow();
  });

  it('toString affiche montant + devise', () => {
    expect(Money.ofXOF(500n).toString()).toBe('500 XOF');
  });
});
