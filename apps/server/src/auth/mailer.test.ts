/**
 * @file   apps/server/src/auth/mailer.test.ts
 * @module server/auth
 * @brief  The mailer speaks SMTP and keeps headers and the body safe (D60).
 *
 * Responsibility: against a fake SMTP server on a local port, through mailerFrom with the
 *                 SBR_SMTP_* settings: the envelope addresses come from SBR_SMTP_FROM and the
 *                 recipient, a subject with a line break never becomes a header of its own,
 *                 a body line starting with "." is dot-stuffed, the message carries a
 *                 Message-ID, and a refused recipient rejects the send. No mailer in website
 *                 mode or without a host.
 * Depends on:     vitest, node:net, ./mailer, ../config/env (types)
 * Spec:           docs/spec/03-security-architecture.md §1
 */
import net, { type AddressInfo } from 'node:net';

import { afterEach, describe, expect, it } from 'vitest';

import type { Env } from '../config/env.js';
import { mailerFrom, type Mailer } from './mailer.js';

let server: net.Server | null = null;
afterEach(() => {
  server?.close();
  server = null;
});

// A server that accepts everything (or refuses RCPT) and keeps the dialogue.
function fakeServer(refuseRecipient = false): Promise<{ port: number; seen: string[] }> {
  const seen: string[] = [];
  server = net.createServer((socket) => {
    let data = false;
    let buffer = '';
    socket.write('220 fake\r\n');
    socket.on('data', (chunk) => {
      buffer += chunk.toString();
      let at = buffer.indexOf('\r\n');
      while (at >= 0) {
        const line = buffer.slice(0, at);
        buffer = buffer.slice(at + 2);
        seen.push(line);
        if (data) {
          if (line === '.') {
            data = false;
            socket.write('250 queued\r\n');
          }
        } else if (line.startsWith('EHLO')) socket.write('250-fake\r\n250 OK\r\n');
        else if (line.startsWith('RCPT') && refuseRecipient) socket.write('550 no such user\r\n');
        else if (line === 'DATA') {
          data = true;
          socket.write('354 go\r\n');
        } else if (line === 'QUIT') socket.end('221 bye\r\n');
        else socket.write('250 OK\r\n');
        at = buffer.indexOf('\r\n');
      }
    });
  });
  return new Promise((resolve) => {
    server?.listen(0, '127.0.0.1', () => {
      resolve({ port: (server?.address() as AddressInfo).port, seen });
    });
  });
}

// The mailer of a standalone install whose SMTP settings point at the fake server.
function mailerAt(port: number): Mailer {
  const env = {
    SBR_AUTH_MODE: 'local',
    SBR_SMTP_HOST: '127.0.0.1',
    SBR_SMTP_PORT: port,
    SBR_SMTP_FROM: 'Bingo <bingo@example.org>',
  } as Env;
  const mailer = mailerFrom(env);
  if (mailer === null) throw new Error('no mailer');
  return mailer;
}

const send = (port: number) =>
  mailerAt(port).send(
    'ann@example.org',
    'Hello\r\nBcc: evil@example.org',
    'Line one\n.starts with a dot',
  );

describe('the mailer (D60)', () => {
  it('sends the envelope, one subject header, a dot-stuffed body and a Message-ID', async () => {
    const { port, seen } = await fakeServer();
    await send(port);
    expect(seen).toContain('MAIL FROM:<bingo@example.org>');
    expect(seen).toContain('RCPT TO:<ann@example.org>');
    expect(seen.some((l) => l.startsWith('Subject: Hello'))).toBe(true);
    expect(seen.some((l) => l.startsWith('Bcc:'))).toBe(false);
    expect(seen).toContain('..starts with a dot');
    expect(seen.some((l) => /^Message-ID: <.+@.+>$/i.test(l))).toBe(true);
  });

  it('rejects when the server refuses the recipient', async () => {
    const { port } = await fakeServer(true);
    await expect(send(port)).rejects.toThrow();
  });

  it('is none in website mode or without a host', () => {
    expect(mailerFrom({ SBR_AUTH_MODE: 'website', SBR_SMTP_HOST: 'mail' } as Env)).toBeNull();
    expect(mailerFrom({ SBR_AUTH_MODE: 'local' } as Env)).toBeNull();
  });
});
