import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createLogger } from './logger';

function captureLogs() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(String(chunk));
      callback();
    },
  });
  return { lines, logger: createLogger('info', stream) };
}

describe('logger', () => {
  it('redacts passwords, cookies and authorization headers', () => {
    const { lines, logger } = captureLogs();
    logger.info(
      {
        password: 'hunter2',
        body: { password: 'hunter2' },
        req: { headers: { cookie: 'acme_session=secret-token', authorization: 'Bearer abc' } },
        res: { headers: { 'set-cookie': 'acme_session=secret-token' } },
      },
      'login attempt',
    );
    const output = lines.join('');
    expect(output).toContain('login attempt');
    expect(output).not.toContain('hunter2');
    expect(output).not.toContain('secret-token');
    expect(output).not.toContain('Bearer abc');
  });

  it('respects the configured level', () => {
    const { lines, logger } = captureLogs();
    logger.debug('noisy detail');
    expect(lines).toHaveLength(0);
  });
});
