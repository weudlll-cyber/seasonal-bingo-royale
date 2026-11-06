/**
 * @file   apps/server/src/auth/smtp.ts
 * @module server/auth
 * @brief  A minimal SMTP client: one plain-text message to one address (RFC 5321, 3207, 4954).
 *
 * Responsibility: connect (port 465: TLS from the start; else plain and STARTTLS when the
 *                 server offers it), EHLO, AUTH PLAIN when a user is set (only over TLS), MAIL
 *                 FROM, RCPT TO, DATA with dot-stuffing and CRLF line ends, QUIT. Certificates
 *                 are checked (Node's default). Header values lose CR and LF (no header
 *                 injection). 15 s per reply. No dependency: the mail libraries on offer carried
 *                 advisories or a license outside the project's allow list (2026-11-06).
 * Depends on:     node:net, node:tls
 * Used by:        ./mailer
 * Spec:           docs/spec/03-security-architecture.md §1
 */
import net from 'node:net';
import tls from 'node:tls';

export interface SmtpMessage {
  readonly host: string;
  readonly port: number;
  readonly user?: string | undefined;
  readonly password?: string | undefined;
  readonly from: string;
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

const TIMEOUT_MS = 15_000;
const oneLine = (value: string): string => value.replace(/[\r\n]+/g, ' ');
// "Name <a@b>" → "a@b"; a bare address stays.
const addressOf = (value: string): string => /<([^<>\s]+)>/.exec(value)?.[1] ?? value.trim();

// Reads whole replies ("250-…" lines until "250 …") from a socket.
class Replies {
  private buffer = '';
  private waiting: ((reply: string) => void) | null = null;

  constructor(private socket: net.Socket) {
    this.listen(socket);
  }

  listen(socket: net.Socket): void {
    this.socket = socket;
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => {
      this.buffer += chunk;
      this.flush();
    });
  }

  private flush(): void {
    const lines = this.buffer.split('\r\n');
    const end = lines.findIndex((l) => /^\d{3} /.test(l));
    if (end < 0 || this.waiting === null) return;
    const reply = lines.slice(0, end + 1).join('\n');
    this.buffer = lines.slice(end + 1).join('\r\n');
    const done = this.waiting;
    this.waiting = null;
    done(reply);
  }

  next(expect: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('SMTP server did not answer'));
      }, TIMEOUT_MS);
      this.waiting = (reply) => {
        clearTimeout(timer);
        if (reply.startsWith(String(expect)) || (expect === 250 && reply.startsWith('251')))
          resolve(reply);
        else reject(new Error(`SMTP refused: ${reply.split('\n')[0] ?? ''}`));
      };
      this.flush();
    });
  }

  async send(line: string, expect: number): Promise<string> {
    this.socket.write(`${line}\r\n`);
    return this.next(expect);
  }
}

function connect(message: SmtpMessage): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const options = { host: message.host, port: message.port, servername: message.host };
    const socket = message.port === 465 ? tls.connect(options) : net.connect(options);
    socket.once(message.port === 465 ? 'secureConnect' : 'connect', () => {
      resolve(socket);
    });
    socket.once('error', reject);
  });
}

// STARTTLS on the open connection; the replies continue on the TLS socket.
function upgrade(socket: net.Socket, host: string): Promise<tls.TLSSocket> {
  return new Promise((resolve, reject) => {
    const secure = tls.connect({ socket, servername: host }, () => {
      resolve(secure);
    });
    secure.once('error', reject);
  });
}

function body(message: SmtpMessage): string {
  const lines = [
    `From: ${oneLine(message.from)}`,
    `To: ${oneLine(message.to)}`,
    `Subject: ${oneLine(message.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    ...message.text.split(/\r?\n/).map((l) => (l.startsWith('.') ? `.${l}` : l)),
  ];
  return `${lines.join('\r\n')}\r\n.`;
}

export async function sendSmtp(message: SmtpMessage): Promise<void> {
  let socket = await connect(message);
  const replies = new Replies(socket);
  try {
    await replies.next(220);
    let hello = await replies.send('EHLO seasonal-bingo-royale', 250);
    if (message.port !== 465 && /STARTTLS/i.test(hello)) {
      await replies.send('STARTTLS', 220);
      socket = await upgrade(socket, message.host);
      replies.listen(socket);
      hello = await replies.send('EHLO seasonal-bingo-royale', 250);
    }
    if (message.user !== undefined && message.user !== '') {
      if (!(socket instanceof tls.TLSSocket)) throw new Error('SMTP: no TLS for the password');
      const token = Buffer.from(`\0${message.user}\0${message.password ?? ''}`).toString('base64');
      await replies.send(`AUTH PLAIN ${token}`, 235);
    }
    await replies.send(`MAIL FROM:<${addressOf(message.from)}>`, 250);
    await replies.send(`RCPT TO:<${addressOf(message.to)}>`, 250);
    await replies.send('DATA', 354);
    await replies.send(body(message), 250);
    await replies.send('QUIT', 221).catch(() => undefined);
  } finally {
    socket.destroy();
  }
}
