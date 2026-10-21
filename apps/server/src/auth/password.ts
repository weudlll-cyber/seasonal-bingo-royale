/**
 * @file   apps/server/src/auth/password.ts
 * @module server/auth
 * @brief  Password hashing (argon2id) and the password policy of local accounts (03 §2.1).
 *
 * Responsibility: hash with argon2id m=64 MiB, t=3, p=1 (the parameters live in the
 *                 encoded hash, so they can be raised later); verify in constant time;
 *                 check length 12–128 and a small bundled list of common passwords. No
 *                 composition rules. The full offline top-100k breached list is backlog.
 * Depends on:     @node-rs/argon2
 * Used by:        ./accounts, ../http/routes/auth
 * Spec:           docs/spec/03-security-architecture.md §2.1
 */
import { hash, verify } from '@node-rs/argon2';

const ARGON2ID = {
  algorithm: 2, // Algorithm.Argon2id (an ambient const enum, not importable as a value)
  memoryCost: 64 * 1024, // KiB
  timeCost: 3,
  parallelism: 1,
} as const;

// A few of the most common passwords of at least 12 characters. A stand-in for the
// bundled top-100k breached list (backlog).
const COMMON = new Set([
  'password1234',
  '123456789012',
  'qwertyuiopas',
  'iloveyou1234',
  'passwordpassword',
  'letmein12345',
  'abcdefghijkl',
  '111111111111',
  'qwerty123456',
  'administrator',
]);

export type PasswordProblem = 'tooShort' | 'tooLong' | 'tooCommon';

export function passwordProblem(password: string): PasswordProblem | null {
  if (password.length < 12) return 'tooShort';
  if (password.length > 128) return 'tooLong';
  if (COMMON.has(password.toLowerCase())) return 'tooCommon';
  return null;
}

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2ID);
}

export async function verifyPassword(encoded: string, password: string): Promise<boolean> {
  try {
    return await verify(encoded, password);
  } catch {
    return false;
  }
}

// A real hash of a random password: login verifies against it when the e-mail is unknown,
// so the answer takes as long as for a known account (no enumeration, 03 §2.1).
let dummyHash: Promise<string> | null = null;
export function dummyPasswordHash(): Promise<string> {
  dummyHash ??= hashPassword(`dummy-${String(Math.random())}-password`);
  return dummyHash;
}
