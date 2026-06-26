/**
 * Vérifie qu'une mutation invalide bien le cache TanStack des listes.
 * On stub apiFetch pour ne pas toucher le réseau.
 */
import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/lib/auth/api-client', () => ({
  apiFetch: vi.fn(),
}));

import * as Api from '@/lib/api/contacts.api';
import { apiFetch } from '@/lib/auth/api-client';

const apiFetchMock = apiFetch as unknown as ReturnType<typeof vi.fn>;

function withClient(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe('contacts.api hooks', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it('useContacts charge une première page', async () => {
    apiFetchMock.mockResolvedValueOnce({ items: [{ id: 'c1', nom: 'Test' }], next_cursor: null });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(() => Api.useContacts({}), { wrapper: withClient(client) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.pages[0]?.items[0]?.id).toBe('c1');
  });

  it('useCreateContact invalide le cache des listes après succès', async () => {
    apiFetchMock.mockImplementation(async (path: string) => {
      if (path.startsWith('/contacts?')) return { items: [], next_cursor: null };
      if (path === '/contacts') return { id: 'new', nom: 'New' };
      return null;
    });

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = withClient(client);

    const list = renderHook(() => Api.useContacts({}), { wrapper });
    await waitFor(() => expect(list.result.current.isSuccess).toBe(true));

    const initialFetchedAt = client.getQueryState(Api.contactsKeys.list({}))!.dataUpdatedAt;

    const create = renderHook(() => Api.useCreateContact(), { wrapper });
    await act(async () => {
      await create.result.current.mutateAsync({ nom: 'New', email: 'x@x.io' } as never);
    });

    // L'invalidation force un refetch → dataUpdatedAt change
    await waitFor(() => {
      const next = client.getQueryState(Api.contactsKeys.list({}));
      expect(next?.dataUpdatedAt).toBeGreaterThan(initialFetchedAt);
    });
  });

  it('useArchiveContact invalide le détail + la liste', async () => {
    apiFetchMock.mockImplementation(async (path: string, init?: { method?: string }) => {
      if (path === '/contacts/c42' && (!init || init.method !== 'DELETE'))
        return { id: 'c42', nom: 'Cible' };
      if (path === '/contacts/c42' && init?.method === 'DELETE') return undefined;
      if (path.startsWith('/contacts?')) return { items: [], next_cursor: null };
      return null;
    });

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = withClient(client);

    renderHook(() => Api.useContact('c42'), { wrapper });
    renderHook(() => Api.useContacts({}), { wrapper });
    await waitFor(() => expect(client.getQueryData(Api.contactsKeys.detail('c42'))).toBeTruthy());

    const archive = renderHook(() => Api.useArchiveContact(), { wrapper });
    await act(async () => {
      await archive.result.current.mutateAsync('c42');
    });

    await waitFor(() => {
      const detailState = client.getQueryState(Api.contactsKeys.detail('c42'));
      expect(detailState?.isInvalidated).toBe(true);
    });
  });
});
