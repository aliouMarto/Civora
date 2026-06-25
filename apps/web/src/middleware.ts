import { type NextRequest, NextResponse } from 'next/server';
import { REFRESH_COOKIE } from '@/lib/auth/session';

const PUBLIC_PATHS = ['/login', '/api/auth/refresh', '/api/auth/logout', '/manifest.json', '/sw.js'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  if (isPublic) return NextResponse.next();

  // Static assets
  if (pathname.startsWith('/_next') || pathname.startsWith('/icons') || pathname.includes('.')) {
    return NextResponse.next();
  }

  const hasRefreshCookie = request.cookies.has(REFRESH_COOKIE);

  if (!hasRefreshCookie) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
