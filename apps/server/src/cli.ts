/**
 * @file   apps/server/src/cli.ts
 * @module server
 * @brief  Operator commands run inside the app image: migrate, create the first admin, check the keys.
 *
 * Responsibility: `reset-2fa --name` clears an admin's two-factor (D60). `create-super --email
 *                 --name` reads the password (no echo, else stdin), makes a super_admin+organizer
 *                 account, never prints it; standalone only, website installs refuse (D41).
 *                 `check-seed-key` opens a stored v2 sealed seed; `check-recovery-code --name`
 *                 checks a stdin code against unused recovery codes (read only; exit 1 on none).
 *                 `migrate` applies migrations as schema owner, grants the app role (the kit's, ./db/appRole);
 *                 non-zero exit blocks start. `loadcheck preflight|accounts|cleanup` serves
 *                 `sbr loadcheck` (12 §5).
 * Depends on:     ./config/env, ./config/seedKey, ./config/maintenance, ./db/pool,
 *                 ./db/migrator, ./db/appRole, ./auth/accounts, ./auth/password,
 *                 ./auth/sessionPlugin, ./loadcheck/accounts, ./match/runtime,
 *                 ./match/sealedSeedCheck
 * Used by:        ops/sbr (docker compose exec app node dist/cli.js …), ops/lib/backup.sh (drill),
 *                 ops/compose.yml (the migrate service), ops/test/real-site-drill.sh
 * Spec:           docs/spec/09-deployment-architecture.md §4–§6; docs/spec/03-security-architecture.md §2.1
 */
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';

import { grantAppRole, sessionCookie } from '@seasonal/kit/server';

import { registerAccount } from './auth/accounts.js';
import { passwordProblem } from './auth/password.js';
import { SESSION_COOKIE } from './auth/sessionPlugin.js';
import { recoveryCodeStored, resetTwoFactor } from './auth/twoFactor.js';
import { loadEnv } from './config/env.js';
import { maintenanceFlag } from './config/maintenance.js';
import { recoveryKeyFrom, seedKeyFrom } from './config/seedKey.js';
import { APP_ROLE_GRANTS } from './db/appRole.js';
import { migrate } from './db/migrator.js';
import { createPool } from './db/pool.js';
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
  // Website admins are game admins (D41) and nobody signs in with a password there (D37).
  if (loadEnv().SBR_AUTH_MODE === 'website') {
    console.error(
      'Not needed in website mode: website admins are game admins (D41), and there is no password sign-in here (D37).',
    );
    return 1;
  }
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

// `check-recovery-code --name <display name>`: the code (read like a password, never printed)
// matches an unused stored recovery code of that account under SBR_RECOVERY_KEY; nothing is
// used up. The rehearsal's restore drill runs it after a restore into a fresh install.
async function checkRecoveryCode(args: readonly string[]): Promise<number> {
  const name = flag(args, '--name');
  if (name === null) {
    console.error('usage: check-recovery-code --name <display name> (the code on standard input)');
    return 2;
  }
  const env = loadEnv();
  const code = await readSecret('Recovery code: ');
  const pool = createPool(env.DATABASE_URL);
  try {
    if (!(await recoveryCodeStored(pool, recoveryKeyFrom(env), name, code))) {
      console.error(
        `The code matches no unused recovery code of ${name} under this install's key.`,
      );
      return 1;
    }
    console.log(`the recovery code matches an unused stored code of ${name}`);
    return 0;
  } finally {
    await pool.end();
  }
}

// The owner applies the migrations, then lets the app role read and write the tables.
async function migrateAsOwner(): Promise<number> {
  const pool = createPool(loadEnv().DATABASE_URL);
  try {
    const applied = await migrate(pool);
    const granted = await grantAppRole(pool, APP_ROLE_GRANTS);
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
      const { name } = sessionCookie({
        name: SESSION_COOKIE,
        secure: !env.SBR_DEV,
        basePath: env.SBR_BASE_PATH,
      });
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
  ['check-recovery-code', checkRecoveryCode],
]);

const [command = '', ...rest] = process.argv.slice(2);
const chosen = COMMANDS.get(command);
const run = chosen === undefined ? Promise.resolve(-1) : chosen(rest);
run.then(
  (code) => {
    if (code === -1) {
      console.error(
        'commands: migrate | create-super --email <e-mail> --name <name> | reset-2fa --name <name> | check-seed-key | check-recovery-code --name <name> | loadcheck …',
      );
    }
    process.exit(code === -1 ? 2 : code);
  },
  (error: unknown) => {
    console.error('[sbr] fatal:', error);
    process.exit(1);
  },
);
