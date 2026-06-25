'use client';

import { useAuthStore } from '@/lib/store/auth.store';
import { API_BASE } from './session';

type RequestInit2 = RequestInit & { _retry?: boolean };

async function refreshAccessToken(): Promise<string | null> {
  try {
    const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token: string };
    useAuthStore.getState().updateAccessToken(data.access_token);
    return data.access_token;
  } catch {
    return null;
  }
}

export async function apiFetch<T = unknown>(
  path: string,
  init: RequestInit2 = {},
): Promise<T> {
  const correlationId = crypto.randomUUID();
  const { accessToken, clearSession } = useAuthStore.getState();

  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  headers.set('X-Correlation-Id', correlationId);
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);

  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const res = await fetch(url, { ...init, headers, credentials: 'include' });

  if (res.status === 401 && !init._retry) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers.set('Authorization', `Bearer ${newToken}`);
      const retried = await fetch(url, { ...init, headers, credentials: 'include', _retry: true } as RequestInit2);
      if (!retried.ok) throw new ApiError(retried.status, await retried.text());
      return retried.json() as Promise<T>;
    }
    clearSession();
    if (typeof window !== 'undefined') window.location.href = '/login';
    throw new ApiError(401, 'Session expirée');
  }

  if (!res.ok) throw new ApiError(res.status, await res.text());
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
