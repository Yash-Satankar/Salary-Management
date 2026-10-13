import { describe, expect, it } from 'vitest';
import { loadEnv } from './env';

const validEnv = {
  DATABASE_URL: 'postgres://acme:acme@localhost:5434/acme_salary',
  HR_EMAIL: 'HR@Acme.test',
  HR_PASSWORD_HASH: '$2b$12$PJT9JiqB.fivwTLLv9S0gOEmSNVQwvuBjWxC/xLIyW9mrZpJg1ee2',
  SESSION_SECRET: 'x'.repeat(32),
  ALLOWED_ORIGINS: 'http://localhost:3000, https://acme.example.com',
  NODE_ENV: 'production',
  PORT: '8080',
  LOG_LEVEL: 'warn',
};

describe('loadEnv', () => {
  it('parses a complete environment', () => {
    expect(loadEnv(validEnv)).toEqual({
      DATABASE_URL: validEnv.DATABASE_URL,
      HR_EMAIL: 'hr@acme.test',
      HR_PASSWORD_HASH: validEnv.HR_PASSWORD_HASH,
      SESSION_SECRET: validEnv.SESSION_SECRET,
      ALLOWED_ORIGINS: ['http://localhost:3000', 'https://acme.example.com'],
      NODE_ENV: 'production',
      PORT: 8080,
      LOG_LEVEL: 'warn',
    });
  });

  it('defaults NODE_ENV, PORT and LOG_LEVEL', () => {
    const { NODE_ENV: _env, PORT: _port, LOG_LEVEL: _level, ...required } = validEnv;
    expect(loadEnv(required)).toMatchObject({
      NODE_ENV: 'development',
      PORT: 4000,
      LOG_LEVEL: 'info',
    });
  });

  it('fails fast on a session secret shorter than 32 characters', () => {
    expect(() => loadEnv({ ...validEnv, SESSION_SECRET: 'too-short' })).toThrow(/SESSION_SECRET/);
  });

  it('rejects a password hash that is not bcrypt', () => {
    expect(() => loadEnv({ ...validEnv, HR_PASSWORD_HASH: 'plaintext' })).toThrow(
      /HR_PASSWORD_HASH/,
    );
  });

  it('names every missing variable in one error', () => {
    expect(() => loadEnv({})).toThrow(
      /DATABASE_URL[\s\S]*HR_EMAIL[\s\S]*HR_PASSWORD_HASH[\s\S]*SESSION_SECRET[\s\S]*ALLOWED_ORIGINS/,
    );
  });

  it('rejects an allowed origin that is not a URL origin', () => {
    expect(() => loadEnv({ ...validEnv, ALLOWED_ORIGINS: 'not a url' })).toThrow(/ALLOWED_ORIGINS/);
  });
});
