import { type NextRequest, NextResponse } from 'next/server';

const SESSION_COOKIE = 'acme_session';

/**
 * UX guard only: sends visitors without a session cookie to /login before any page renders.
 * The API remains the real enforcement point and the client redirects on any 401.
 */
export function proxy(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;
  if (pathname === '/login' || request.cookies.has(SESSION_COOKIE)) {
    return NextResponse.next();
  }
  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('next', `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Skip the API proxy, Next internals and static files.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
