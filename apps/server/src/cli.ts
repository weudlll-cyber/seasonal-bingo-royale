/**
 * @file   apps/server/src/cli.ts
 * @module server
 * @brief  Operator commands run inside the app image: create the first admin, check the seed key.
 *
 * Responsibility: `create-super --email <e-mail> --name <display name>` asks for the
 *                 password (not echoed on a terminal; read from standard input otherwise),
 *                 checks it against the password rules and creates an account with the
 *                 roles super_admin and organizer (every host permission). Until the admin
 *                 app with its bootstrap page exists (WP-19), this is how the first admin
 *                 is made (`sbr admin create-super`). The password is never printed or logged.
 *                 `check-seed-key` opens one stored version-2 sealed seed of DATABASE_URL
 *                 with SBR_SEED_KEY (exit 1 when the key does not open it); the backup drill
 *                 runs it on the restored copy (`sbr restore --drill`).
 * Depends on:     ./config/env, ./config/seedKey, ./db/pool, ./auth/accounts, ./auth/password,
 *                 ./match/sealedSeedCheck, node:readline
 * Used by:        ops/sbr (docker compose exec app node dist/cli.js …), ops/lib/backup.sh (drill)
 * Spec:           docs/spec/09-deployment-architecture.md §4–§6; docs/spec/03-security-architecture.md §2.1
 */
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';

import { registerAccount } from './auth/accounts.js';
import { passwordProblem } from './auth/password.js';
import { loadEnv } from './config/env.js';
import { seedKeyFrom } from './config/seedKey.js';
import { createPool } from './db/pool.js';
import { openOneSealedSeed } from './match/sealedSeedCheck.js';

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

// The seed key opens what the database stores: one sealed seed is decrypted (the drill's proof).
async function checkSeedKey(): Promise<number> {
  const env = loadEnv();
  const pool = createPool(env.DATABASE_URL);
  try {
    const result = await openOneSealedSeed(pool, seedKeyFrom(env));
    console.log(
      result === 'opened'
        ? 'the seed key opens the newest sealed match seed'
        : 'no sealed match seed stored yet (nothing for the seed key to open)',
    );
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  } finally {
    await pool.end();
  }
}

const COMMANDS = new Map<string, (args: readonly string[]) => Promise<number>>([
  ['create-super', createSuper],
  ['check-seed-key', checkSeedKey],
]);

const [command = '', ...rest] = process.argv.slice(2);
const chosen = COMMANDS.get(command);
const run = chosen === undefined ? Promise.resolve(-1) : chosen(rest);
run.then(
  (code) => {
    if (code === -1) {
      console.error('commands: create-super --email <e-mail> --name <name> | check-seed-key');
    }
    process.exit(code === -1 ? 2 : code);
  },
  (error: unknown) => {
    console.error('[sbr] fatal:', error);
    process.exit(1);
  },
);
