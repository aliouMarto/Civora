import { describe, it, expect } from 'vitest';

import { Money } from './money';

describe('Money côté API', () => {
  it('importe correctement depuis @civora/shared-types', () => {
    const m = Money.ofXOF(500_000n);
    expect(m.amount).toBe(500_000n);
    expect(m.currency).toBe('XOF');
  });

  it('calcul de loyer : 12 mois × 150 000 FCFA', () => {
    const loyerMensuel = Money.ofXOF(150_000n);
    const total = loyerMensuel.multiply(12n);
    expect(total.amount).toBe(1_800_000n);
  });

  it('répartition de charges entre 3 locataires', () => {
    const charges = Money.ofXOF(300_000n);
    const parLocataire = charges.divide(3n);
    expect(parLocataire.amount).toBe(100_000n);
  });
});
