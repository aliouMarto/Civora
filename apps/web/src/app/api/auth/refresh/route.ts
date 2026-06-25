import { cookies } from 'next/headers';
import { API_BASE, REFRESH_COOKIE } from '@/lib/auth/session';

export async function POST(): Promise<Response> {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get(REFRESH_COOKIE)?.value;

  if (!refreshToken) {
    return Response.json({ error: 'No refresh token' }, { status: 401 });
  }

  const correlationId = crypto.randomUUID();

  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Correlation-Id': correlationId },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!res.ok) {
      cookieStore.delete(REFRESH_COOKIE);
      return Response.json({ error: 'Refresh failed' }, { status: 401 });
    }

    const data = (await res.json()) as { access_token: string; refresh_token: string };

    cookieStore.set(REFRESH_COOKIE, data.refresh_token, {
      httpOnly: true,
      secure: process.env['NODE_ENV'] === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });

    return Response.json({ access_token: data.access_token });
  } catch {
    return Response.json({ error: 'Server error' }, { status: 500 });
  }
}
