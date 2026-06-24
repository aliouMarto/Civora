import { describe, it, expect } from 'vitest';

import { TenantContextService } from '../tenant-context.service';

describe('TenantContextService', () => {
  const svc = new TenantContextService();

  it('retourne null hors contexte', () => {
    expect(svc.getAgenceId()).toBeNull();
  });

  it("retourne l'agenceId dans le contexte", () => {
    const id = '550e8400-e29b-41d4-a716-446655440000';
    svc.run(id, () => {
      expect(svc.getAgenceId()).toBe(id);
    });
  });

  it('requireAgenceId leve une erreur hors contexte', () => {
    expect(() => svc.requireAgenceId()).toThrow('no agence_id');
  });

  it("requireAgenceId retourne l'id dans le contexte", () => {
    const id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    svc.run(id, () => {
      expect(svc.requireAgenceId()).toBe(id);
    });
  });

  it('isole les contextes imbriques (AsyncLocalStorage)', async () => {
    const idA = 'agence-a-uuid';
    const idB = 'agence-b-uuid';
    const results: string[] = [];

    await Promise.all([
      new Promise<void>((resolve) =>
        svc.run(idA, () => {
          setTimeout(() => {
            results.push(svc.getAgenceId() ?? 'null');
            resolve();
          }, 10);
        }),
      ),
      new Promise<void>((resolve) =>
        svc.run(idB, () => {
          setTimeout(() => {
            results.push(svc.getAgenceId() ?? 'null');
            resolve();
          }, 5);
        }),
      ),
    ]);

    expect(results).toContain(idA);
    expect(results).toContain(idB);
    expect(results.filter((r) => r === idA)).toHaveLength(1);
    expect(results.filter((r) => r === idB)).toHaveLength(1);
  });

  it('hors contexte apres le run(), revient a null', () => {
    const id = 'temp-id';
    svc.run(id, () => {
      /* dans le run */
    });
    expect(svc.getAgenceId()).toBeNull();
  });
});
