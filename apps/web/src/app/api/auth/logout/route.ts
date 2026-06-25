import { cookies } from 'next/headers';
import { API_BASE, REFRESH_COOKIE } from '@/lib/auth/session';

export async function POST(): Promise<Response> {
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
  return Response.json({ ok: true });
}
