# ADR 0008: Single-user auth with a JWT in an httpOnly cookie behind a same-origin Next.js proxy

- Status: Accepted
- Date: 2026-10-13

## Context

Salary data is confidential and v1 has one persona: the HR manager. The web app (Vercel) and API
(Render) are deployed on different domains. Browsers increasingly block third-party cookies, and
tokens in `localStorage` are readable by any injected script.

## Decision

- One HR account from environment variables: `HR_EMAIL` and a bcrypt (cost 12) `HR_PASSWORD_HASH`.
  Login always runs a bcrypt compare (against a dummy hash for unknown emails) so timing reveals
  nothing; failures return one generic 401. Login is rate-limited to 5 per minute.
- On success the API sets an HS256 JWT (`sub` = email, 8 hours) in cookie `acme_session`:
  `HttpOnly; SameSite=Lax; Path=/`, plus `Secure` in production.
- **Same origin by design:** the browser only calls the Next.js origin; `next.config` rewrites
  `/api/:path*` to `${API_ORIGIN}/api/:path*`. The cookie is first-party and no CORS is configured.
- CSRF: mutating routes require `Content-Type: application/json` (multipart only for import) and
  reject an `Origin` header outside `ALLOWED_ORIGINS`.
- The Next.js `proxy.ts` redirects to `/login` without the cookie; the API remains the enforcement
  point, and the client redirects to `/login` on any 401.

## Consequences

- No token handling in JavaScript; XSS cannot read the session.
- Every API call takes one extra hop through Vercel, adding a few milliseconds.
- Logout clears the cookie but cannot revoke an already issued token before it expires; rotating
  `SESSION_SECRET` signs everyone out.
- Adding users and roles means replacing `auth/service.ts` with a user table; the middleware and
  cookie handling stay (docs/FUTURE.md).

## Alternatives considered

- **Direct cross-origin calls with CORS and `SameSite=None` cookies:** blocked by third-party
  cookie restrictions in several browsers.
- **Bearer tokens in localStorage:** readable by injected scripts.
- **A hosted identity provider:** the right choice for many users; excessive for one account in v1.
