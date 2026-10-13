import bcrypt from 'bcryptjs';
import { describe, expect, it } from 'vitest';
import { fixedClock } from '../../lib/clock';
import { createAuthService, DUMMY_PASSWORD_HASH } from './service';

const PASSWORD = 'correct horse battery staple';
// Cost 4 keeps the suite fast; production hashes use cost 12.
const HASH = bcrypt.hashSync(PASSWORD, 4);
const SECRET = 'unit-test-session-secret-0123456789abcdef';

function setup() {
  const clock = fixedClock('2026-10-13T09:00:00Z');
  const compared: string[] = [];
  const service = createAuthService({
    hrEmail: 'hr@acme.test',
    hrPasswordHash: HASH,
    sessionSecret: SECRET,
    clock,
    verifyPassword: async (plain, hash) => {
      compared.push(hash);
      return bcrypt.compare(plain, hash);
    },
  });
  return { service, clock, compared };
}

describe('auth service', () => {
  it('issues a session token for the HR credentials', async () => {
    const { service } = setup();
    const token = await service.login('hr@acme.test', PASSWORD);
    expect(token).toEqual(expect.any(String));
    await expect(service.verifySession(token ?? '')).resolves.toEqual({ email: 'hr@acme.test' });
  });

  it('matches the email case-insensitively', async () => {
    const { service } = setup();
    await expect(service.login('HR@Acme.TEST', PASSWORD)).resolves.toEqual(expect.any(String));
  });

  it('rejects a wrong password', async () => {
    const { service } = setup();
    await expect(service.login('hr@acme.test', 'wrong')).resolves.toBeNull();
  });

  it('still runs a bcrypt compare for an unknown email, so timing does not reveal it', async () => {
    const { service, compared } = setup();
    await expect(service.login('someone@acme.test', PASSWORD)).resolves.toBeNull();
    expect(compared).toEqual([DUMMY_PASSWORD_HASH]);
  });

  it('expires sessions after 8 hours', async () => {
    const { service, clock } = setup();
    const token = (await service.login('hr@acme.test', PASSWORD)) ?? '';
    clock.set('2026-10-13T16:59:00Z');
    await expect(service.verifySession(token)).resolves.toEqual({ email: 'hr@acme.test' });
    clock.set('2026-10-13T17:00:01Z');
    await expect(service.verifySession(token)).resolves.toBeNull();
  });

  it('rejects tampered or foreign tokens', async () => {
    const { service } = setup();
    const token = (await service.login('hr@acme.test', PASSWORD)) ?? '';
    const [header, payload, signature] = token.split('.');
    const forged = `${header}.${payload}.${signature?.slice(0, -2)}xx`;
    await expect(service.verifySession(forged)).resolves.toBeNull();
    await expect(service.verifySession('not-a-jwt')).resolves.toBeNull();
  });
});
