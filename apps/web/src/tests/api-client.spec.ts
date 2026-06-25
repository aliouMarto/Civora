import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiFetch, ApiError } from '@/lib/auth/api-client';

// Mock the auth store
vi.mock('@/lib/store/auth.store', () => ({
  useAuthStore: {
    getState: vi.fn(() => ({
      accessToken: 'valid-token',
      clearSession: vi.fn(),
      updateAccessToken: vi.fn(),
    })),
  },
}));

describe('apiFetch', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid-1234' });
  });

  it('ajoute Authorization et X-Correlation-Id à la requête', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: 'ok' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await apiFetch('/test');

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit & { headers: Headers }];
    expect(init.headers.get('Authorization')).toBe('Bearer valid-token');
    expect(init.headers.get('X-Correlation-Id')).toBe('test-uuid-1234');
  });

  it('sur 401 tente un refresh puis rejoue la requête', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 401, text: async () => 'Unauthorized' })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ access_token: 'new-token' }) }) // refresh
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: 'replayed' }) }); // replay
    vi.stubGlobal('fetch', mockFetch);

    // Mock updateAccessToken
    const { useAuthStore } = await import('@/lib/store/auth.store');
    const mockUpdate = vi.fn();
    (useAuthStore.getState as ReturnType<typeof vi.fn>).mockReturnValue({
      accessToken: 'old-token',
      clearSession: vi.fn(),
      updateAccessToken: mockUpdate,
    });

    const result = await apiFetch<{ data: string }>('/test');
    expect(result.data).toBe('replayed');
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('retourne 204 comme undefined', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 204,
      json: async () => { throw new Error('no body'); },
    }));

    const result = await apiFetch('/test');
    expect(result).toBeUndefined();
  });

  it('lève ApiError sur réponse non-OK', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    }));

    // Make refresh also fail
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'Internal Server Error' })
    );

    await expect(apiFetch('/test')).rejects.toThrow(ApiError);
  });

  it('ApiError expose le status HTTP', async () => {
    const err = new ApiError(404, 'Not found');
    expect(err.status).toBe(404);
    expect(err.message).toBe('Not found');
    expect(err.name).toBe('ApiError');
  });
});
