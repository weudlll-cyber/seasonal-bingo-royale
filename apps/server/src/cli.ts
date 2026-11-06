/**
 * @file   apps/server/src/cli.ts
 * @module server
 * @brief  Operator commands run inside the app image: migrate, create the first admin, check the seed key.
 *
 * Responsibility: `reset-2fa --name <display name>` clears an admin's two-factor sign-in (D60).
 *                 `create-super --email <e-mail> --name <display name>` asks for the password
 *                 (not echoed on a terminal, else read from standard input), checks the password
 *                 rules and creates an account with roles super_admin and organizer (every host
 *                 permission); until the admin app's bootstrap page exists (WP-19) this makes the
 *                 first admin (`sbr admin create-super`). The password is never printed or
 *                 logged. `check-seed-key` opens one stored version-2 sealed seed of DATABASE_URL
 *                 with SBR_SEED_KEY (exit 1 when it fails); the backup drill runs it on the
 *                 restored copy (`sbr restore --drill`). `migrate` applies the migrations to
 *                 DATABASE_URL as the schema's owner and grants the app role its rights (./db/roles);
 *                 the stack's one-shot `migrate` service runs it before the app starts.
 *                 Exit 0 on success; a non-zero exit stops the app from starting.
 *                 `loadcheck preflight|accounts|cleanup` serves `sbr loadcheck` (12 §5): why it
 *                 must not run now (exit 3 with the reason), the temporary accounts with their
 *                 session cookies as JSON on standard output (--players N --spectators M), and
 *                 the cleanup that aborts their open match, removes them and verifies (exit 1
 *                 when anything is left).
 * Depends on:     ./config/env, ./config/seedKey, ./config/maintenance, ./db/pool,
 *                 ./db/migrator, ./db/roles, ./auth/accounts, ./auth/password,
 *                 ./auth/sessionPlugin, ./loadcheck/accounts, ./match/runtime,
 *                 ./match/sealedSeedCheck
 * Used by:        ops/sbr (docker compose exec app node dist/cli.js …), ops/lib/backup.sh (drill),
 *                 ops/compose.yml (the migrate service)
 * Spec:           docs/spec/09-deployment-architecture.md §4–§6; docs/spec/03-security-architecture.md §2.1
 */
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';

import { registerAccount } from './auth/accounts.js';
import { passwordProblem } from './auth/password.js';
import { cookieConfig } from './auth/sessionPlugin.js';
import { resetTwoFactor } from './auth/twoFactor.js';
import { loadEnv } from './config/env.js';
import { maintenanceFlag } from './config/maintenance.js';
import { seedKeyFrom } from './config/seedKey.js';
import { migrate } from './db/migrator.js';
import { createPool } from './db/pool.js';
import { grantAppRole } from './db/roles.js';
import { createLoadAccounts, loadCheckRefusal, removeLoadCheck } from './loadcheck/accounts.js';
import { createMatchRuntime } from './match/runtime.js';
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

// The owner applies the migrations, then lets the app role read and write the tables.
async function migrateAsOwner(): Promise<number> {
  const pool = createPool(loadEnv().DATABASE_URL);
  try {
    const applied = await migrate(pool);
    const granted = await grantAppRole(pool);
    console.log(
      `${String(applied.length)} migrations applied${applied.length > 0 ? `: ${applied.join(', ')}` : ''}; ` +
        (granted
          ? 'app role granted'
          : 'no app role on this database (development, or an install before the roles)'),
    );
    return 0;
  } finally {
    await pool.end();
  }
}

// sbr loadcheck's steps inside the app container (12 §5); the cookies go to standard output only.
async function loadCheck(args: readonly string[]): Promise<number> {
  const env = loadEnv();
  const pool = createPool(env.DATABASE_URL);
  const maintenance = maintenanceFlag(env.SBR_DATA_DIR);
  try {
    if (args[0] === 'preflight') {
      const refusal = await loadCheckRefusal(pool, maintenance() !== null);
      if (refusal !== null) console.error(refusal);
      return refusal === null ? 0 : 3;
    }
    if (args[0] === 'accounts') {
      const counts = {
        players: Number(flag(args, '--players') ?? 200),
        spectators: Number(flag(args, '--spectators') ?? 50),
      };
      const name = cookieConfig(!env.SBR_DEV, env.SBR_BASE_PATH).name;
      console.log(JSON.stringify(await createLoadAccounts(pool, counts, name)));
      return 0;
    }
    if (args[0] === 'cleanup') {
      const runtime = createMatchRuntime(pool, seedKeyFrom(env), maintenance);
      const r = await removeLoadCheck(pool, runtime.engine);
      const left = r.left.accounts + r.left.sessions + r.left.matches;
      console.log(
        `load check cleaned up: ${String(r.aborted)} match(es) aborted, ${String(r.removed)} account(s) removed; left: ${String(r.left.accounts)} accounts, ${String(r.left.sessions)} sessions, ${String(r.left.matches)} open matches`,
      );
      return left === 0 ? 0 : 1;
    }
    console.error('usage: loadcheck preflight | accounts --players N --spectators M | cleanup');
    return 2;
  } finally {
    await pool.end();
  }
}

// `reset-2fa --name <display name>`: an admin who lost the authenticator and the recovery
// codes enrols again at the next sign-in (D60); the account's sessions end. No audit table
// exists: the line printed here is the record (sbr's output, journal of the operator's shell).
async function resetTwoFactorCommand(args: readonly string[]): Promise<number> {
  const name = flag(args, '--name');
  if (name === null) {
    console.error('usage: reset-2fa --name <display name>');
    return 2;
  }
  const pool = createPool(loadEnv().DATABASE_URL);
  try {
    if (!(await resetTwoFactor(pool, name))) {
      console.error(`No account named ${name}.`);
      return 1;
    }
    console.log(
      `[sbr] ${new Date().toISOString()} two-factor sign-in reset for ${name}; it enrols again at the next sign-in.`,
    );
    return 0;
  } finally {
    await pool.end();
  }
}

const COMMANDS = new Map<string, (args: readonly string[]) => Promise<number>>([
  ['migrate', migrateAsOwner],
  ['loadcheck', loadCheck],
  ['create-super', createSuper],
  ['reset-2fa', resetTwoFactorCommand],
  ['check-seed-key', checkSeedKey],
]);

const [command = '', ...rest] = process.argv.slice(2);
const chosen = COMMANDS.get(command);
const run = chosen === undefined ? Promise.resolve(-1) : chosen(rest);
run.then(
  (code) => {
    if (code === -1) {
      console.error(
        'commands: migrate | create-super --email <e-mail> --name <name> | reset-2fa --name <name> | check-seed-key | loadcheck …',
      );
    }
    process.exit(code === -1 ? 2 : code);
  },
  (error: unknown) => {
    console.error('[sbr] fatal:', error);
    process.exit(1);
  },
);
