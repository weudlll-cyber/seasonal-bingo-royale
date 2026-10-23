/**
 * @file   apps/server/src/cli.ts
 * @module server
 * @brief  Operator commands run inside the app container: create the first admin account.
 *
 * Responsibility: `create-super --email <e-mail> --name <display name>` asks for the
 *                 password (not echoed on a terminal; read from standard input otherwise),
 *                 checks it against the password rules and creates an account with the
 *                 roles super_admin and organizer (every host permission). Until the admin
 *                 app with its bootstrap page exists (WP-19), this is how the first admin
 *                 is made (`sbr admin create-super`). The password is never printed or logged.
 * Depends on:     ./config/env, ./db/pool, ./auth/accounts, ./auth/password, node:readline
 * Used by:        ops/sbr (docker compose exec app node dist/cli.js …)
 * Spec:           docs/spec/09-deployment-architecture.md §4, §5; docs/spec/03-security-architecture.md §2.1
 */
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';

import { registerAccount } from './auth/accounts.js';
import { passwordProblem } from './auth/password.js';
import { loadEnv } from './config/env.js';
import { createPool } from './db/pool.js';

function flag(args: readonly string[], name: string): string | null {
  const at = args.indexOf(name);
  return at >= 0 ? (args[at + 1] ?? null) : null;
}

// One line from standard input; on a terminal the typed characters are not shown.
async function readSecret(prompt: string): Promise<string> {
  let muted = false;
  const output = new Writable({
    write(chunk: Buffer, _encoding, done) {
      if (!muted) process.stdout.write(chunk);
      done();
    },
  });
  const rl = createInterface({ input: process.stdin, output, terminal: process.stdin.isTTY });
  process.stdout.write(prompt);
  muted = true;
  const line = await new Promise<string>((resolve) => rl.once('line', resolve));
  rl.close();
  process.stdout.write('\n');
  return line;
}

async function createSuper(args: readonly string[]): Promise<number> {
  const email = flag(args, '--email');
  const displayName = flag(args, '--name');
  if (email === null || displayName === null) {
    console.error('usage: create-super --email <e-mail> --name <display name>');
    return 2;
  }
  const password = await readSecret('Password (at least 12 characters): ');
  const problem = passwordProblem(password);
  if (problem !== null) {
    console.error(`The password is not accepted (${problem}).`);
    return 1;
  }
  const pool = createPool(loadEnv().DATABASE_URL);
  try {
    const created = await registerAccount(pool, {
      email,
      displayName,
      password,
      roles: ['super_admin', 'organizer'],
    });
    if (!created.ok) {
      console.error('An account with this e-mail or display name exists already.');
      return 1;
    }
    console.log(`Created the admin account ${displayName} <${email}> (super_admin, organizer).`);
    return 0;
  } finally {
    await pool.end();
  }
}

const [command, ...rest] = process.argv.slice(2);
const run = command === 'create-super' ? createSuper(rest) : Promise.resolve(-1);
run.then(
  (code) => {
    if (code === -1) console.error('commands: create-super --email <e-mail> --name <name>');
    process.exit(code === -1 ? 2 : code);
  },
  (error: unknown) => {
    console.error('[sbr] fatal:', error);
    process.exit(1);
  },
);
