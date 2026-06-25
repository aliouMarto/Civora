'use server';

import { cookies } from 'next/headers';
import { API_BASE, REFRESH_COOKIE } from '@/lib/auth/session';
import { z } from 'zod';

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type LoginResult =
  | { ok: true; access_token: string; user: Record<string, unknown> }
  | { ok: false; error: string };

export async function loginAction(_prev: LoginResult | null, formData: FormData): Promise<LoginResult> {
  const raw = { email: formData.get('email'), password: formData.get('password') };
  const parsed = LoginSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'auth.login.error_invalid' };

  const correlationId = crypto.randomUUID();

  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Correlation-Id': correlationId },
      body: JSON.stringify(parsed.data),
    });

    if (res.status === 401 || res.status === 400) return { ok: false, error: 'auth.login.error_invalid' };
    if (!res.ok) return { ok: false, error: 'auth.login.error_server' };

    const data = (await res.json()) as { access_token: string; refresh_token: string; user: Record<string, unknown> };

    const cookieStore = await cookies();
    cookieStore.set(REFRESH_COOKIE, data.refresh_token, {
      httpOnly: true,
      secure: process.env['NODE_ENV'] === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });

    return { ok: true, access_token: data.access_token, user: data.user };
  } catch {
    return { ok: false, error: 'auth.login.error_server' };
  }
}

export async function logoutAction(): Promise<void> {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get(REFRESH_COOKIE)?.value;

  if (refreshToken) {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
    } catch {
      // best-effort
    }
  }

  cookieStore.delete(REFRESH_COOKIE);
}
