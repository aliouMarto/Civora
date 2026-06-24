import { describe, it, expect } from 'vitest';

import { ApiErrorSchema, ERROR_CODES } from '../src/errors';
import { AgenceIdSchema, EntiteIdSchema, UserIdSchema } from '../src/ids';
import { CursorPaginationInputSchema, OffsetPaginationInputSchema } from '../src/pagination';
import { AgenceSchema, EntiteSchema } from '../src/tenant';

describe('IDs branded schemas', () => {
  it('valide un UUID valide comme AgenceId', () => {
    const id = AgenceIdSchema.parse('550e8400-e29b-41d4-a716-446655440000');
    expect(id).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('rejette un non-UUID comme EntiteId', () => {
    expect(() => EntiteIdSchema.parse('not-a-uuid')).toThrow();
  });

  it('valide UserId', () => {
    const id = UserIdSchema.parse('123e4567-e89b-12d3-a456-426614174000');
    expect(typeof id).toBe('string');
  });
});

describe('Pagination schemas', () => {
  it('CursorPagination avec valeurs par défaut', () => {
    const input = CursorPaginationInputSchema.parse({});
    expect(input.limit).toBe(20);
    expect(input.cursor).toBeUndefined();
  });

  it('CursorPagination rejette limit > 100', () => {
    expect(() => CursorPaginationInputSchema.parse({ limit: 200 })).toThrow();
  });

  it('OffsetPagination avec valeurs par défaut', () => {
    const input = OffsetPaginationInputSchema.parse({});
    expect(input.page).toBe(1);
    expect(input.limit).toBe(20);
  });

  it('OffsetPagination rejette page < 1', () => {
    expect(() => OffsetPaginationInputSchema.parse({ page: 0 })).toThrow();
  });
});

describe('ApiError schema', () => {
  it('valide une erreur avec code et message', () => {
    const err = ApiErrorSchema.parse({ code: 'GEN_001', message: 'Not found' });
    expect(err.code).toBe('GEN_001');
  });

  it('valide avec details optionnels', () => {
    const err = ApiErrorSchema.parse({
      code: 'VAL_001',
      message: 'Validation failed',
      details: { field: 'email' },
    });
    expect(err.details?.['field']).toBe('email');
  });

  it('ERROR_CODES contient les codes attendus', () => {
    expect(ERROR_CODES.NOT_FOUND).toBe('GEN_001');
    expect(ERROR_CODES.UNAUTHORIZED).toBe('AUTH_001');
  });
});

describe('Tenant schemas', () => {
  const agenceId = '550e8400-e29b-41d4-a716-446655440000';
  const entiteId = '123e4567-e89b-12d3-a456-426614174000';

  it('valide une Agence complète', () => {
    const agence = AgenceSchema.parse({
      id: agenceId,
      nom: 'Immobilier Abidjan',
      slug: 'immobilier-abidjan',
      pays: 'CI',
      actif: true,
      createdAt: new Date().toISOString(),
    });
    expect(agence.slug).toBe('immobilier-abidjan');
  });

  it('rejette un slug avec espaces', () => {
    expect(() =>
      AgenceSchema.parse({
        id: agenceId,
        nom: 'Test',
        slug: 'slug avec espaces',
        pays: 'CI',
        createdAt: new Date().toISOString(),
      }),
    ).toThrow();
  });

  it('valide une Entite', () => {
    const entite = EntiteSchema.parse({
      id: entiteId,
      agenceId,
      nom: 'Agence Nord',
      actif: true,
    });
    expect(entite.agenceId).toBe(agenceId);
  });
});
