/**
 * @file   apps/server/src/auth/smtp.test.ts
 * @module server/auth
 * @brief  The SMTP client speaks the dialogue and keeps headers and the body safe.
 *
 * Responsibility: against a fake SMTP server on a local port: the envelope addresses come
 *                 from the From and To values, a subject with a line break stays one header
 *                 line, a body line starting with "." is dot-stuffed, and a refused recipient
 *                 rejects the send.
 * Depends on:     vitest, node:net, ./smtp
 * Spec:           docs/spec/03-security-architecture.md §1
 */
import net, { type AddressInfo } from 'node:net';

import { afterEach, describe, expect, it } from 'vitest';

import { sendSmtp } from './smtp.js';

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

const message = (port: number) => ({
  host: '127.0.0.1',
  port,
  from: 'Bingo <bingo@example.org>',
  to: 'ann@example.org',
  subject: 'Hello\r\nBcc: evil@example.org',
  text: 'Line one\n.starts with a dot',
});

describe('the SMTP client', () => {
  it('sends the envelope, one subject line and a dot-stuffed body', async () => {
    const { port, seen } = await fakeServer();
    await sendSmtp(message(port));
    expect(seen).toContain('MAIL FROM:<bingo@example.org>');
    expect(seen).toContain('RCPT TO:<ann@example.org>');
    expect(seen).toContain('Subject: Hello Bcc: evil@example.org');
    expect(seen.some((l) => l.startsWith('Bcc:'))).toBe(false);
    expect(seen).toContain('..starts with a dot');
  });

  it('rejects when the server refuses the recipient', async () => {
    const { port } = await fakeServer(true);
    await expect(sendSmtp(message(port))).rejects.toThrow(/refused/);
  });
});
