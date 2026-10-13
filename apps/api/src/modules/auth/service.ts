import bcrypt from 'bcryptjs';
import { jwtVerify, SignJWT } from 'jose';
import type { Clock } from '../../lib/clock';

export const SESSION_TTL_SECONDS = 8 * 60 * 60;

/**
 * A cost-12 hash of a random string nobody knows. Comparing against it when the email does not
 * match makes a wrong email take as long as a wrong password, so response time leaks nothing.
 */
export const DUMMY_PASSWORD_HASH = '$2b$12$CLLeBC7hmx5esp8g0w689u6HhQb/9uiDiPXu73Nv5y6YyJlTdz8Za';

export interface Session {
  email: string;
}

export interface AuthService {
  /** Returns a signed session token, or null for any credential mismatch. */
  login(email: string, password: string): Promise<string | null>;
  verifySession(token: string): Promise<Session | null>;
}

export interface AuthServiceDeps {
  hrEmail: string;
  hrPasswordHash: string;
  sessionSecret: string;
  clock: Clock;
  verifyPassword?: (plain: string, hash: string) => Promise<boolean>;
}

export function createAuthService({
  hrEmail,
  hrPasswordHash,
  sessionSecret,
  clock,
  verifyPassword = bcrypt.compare,
}: AuthServiceDeps): AuthService {
  const key = new TextEncoder().encode(sessionSecret);
  const normalisedHrEmail = hrEmail.toLowerCase();

  return {
    async login(email, password) {
      const emailMatches = email.toLowerCase() === normalisedHrEmail;
      const passwordMatches = await verifyPassword(
        password,
        emailMatches ? hrPasswordHash : DUMMY_PASSWORD_HASH,
      );
      if (!emailMatches || !passwordMatches) {
        return null;
      }
      const issuedAt = Math.floor(clock.now().getTime() / 1000);
      return new SignJWT()
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(normalisedHrEmail)
        .setIssuedAt(issuedAt)
        .setExpirationTime(issuedAt + SESSION_TTL_SECONDS)
        .sign(key);
    },

    async verifySession(token) {
      try {
        const { payload } = await jwtVerify(token, key, {
          algorithms: ['HS256'],
          currentDate: clock.now(),
        });
        return payload.sub ? { email: payload.sub } : null;
      } catch {
        return null;
      }
    },
  };
}
