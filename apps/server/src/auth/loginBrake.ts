/**
 * @file   apps/server/src/auth/loginBrake.ts
 * @module server/auth
 * @brief  The password sign-in's brake: the kit's FailureBrake with Bingo's live limit (K46).
 *
 * Responsibility: only wrong passwords are counted (the kit's `FailureBrake`: ask `braked(key)`
 *                 before the password check, call `failed(key)` on a wrong one). Two things the
 *                 kit's class does not take, held here: a limit the admin area's Technical
 *                 section changes at runtime (the kit reads a rule once, so a changed limit
 *                 starts a new brake and its counts), and checks still under way: a failure is
 *                 counted only after the hash, so guesses sent together would all pass; a key
 *                 therefore has at most as many checks under way as failures it is allowed.
 * Depends on:     @seasonal/kit/server (FailureBrake, types)
 * Used by:        ../http/routes/auth
 * Spec:           docs/spec/03-security-architecture.md §13
 */
import { FailureBrake, type RateRule, type RateRuleSource } from '@seasonal/kit/server';

export class LoginBrake {
  private held: { readonly limit: number; readonly brake: FailureBrake } | undefined;
  private readonly checks = new Map<string, number>();

  constructor(private readonly source: RateRuleSource) {}

  // The kit's brake for the rule as it is now.
  private current(): { readonly limit: number; readonly brake: FailureBrake } {
    const rule: RateRule = typeof this.source === 'function' ? this.source() : this.source;
    if (this.held?.limit !== rule.limit) {
      this.held = { limit: rule.limit, brake: new FailureBrake(rule) };
    }
    return this.held;
  }

  // True while the key may not try: its failures fill the window, or its checks under way do.
  braked(key: string): boolean {
    const { limit, brake } = this.current();
    return brake.braked(key) || (this.checks.get(key) ?? 0) >= limit;
  }

  // One wrong password for the key; a correct one is never counted.
  failed(key: string): void {
    this.current().brake.failed(key);
  }

  // A password check for the key begins; the returned function ends it (once, however often it
  // is called).
  checking(key: string): () => void {
    this.checks.set(key, (this.checks.get(key) ?? 0) + 1);
    let under = true;
    return () => {
      if (!under) return;
      under = false;
      const left = (this.checks.get(key) ?? 1) - 1;
      if (left > 0) this.checks.set(key, left);
      else this.checks.delete(key);
    };
  }
}

export type BrakeKey = readonly [LoginBrake, string];

// One password check behind the brakes: false, and no check, when a key is braked. `judged(wrong)`
// is called as soon as the password has been judged: it counts a wrong one and ends the check;
// waiting for the answer instead would hold the check until it has left, and correct sign-ins in
// a row would brake themselves.
export async function behindBrakes(
  keys: readonly BrakeKey[],
  check: (judged: (wrong: boolean) => void) => PromiseLike<unknown>,
): Promise<boolean> {
  if (keys.some(([brake, key]) => brake.braked(key))) return false;
  const done = keys.map(([brake, key]) => brake.checking(key));
  const judged = (wrong: boolean): void => {
    if (wrong) for (const [brake, key] of keys) brake.failed(key);
    for (const end of done) end();
  };
  try {
    await check(judged);
  } finally {
    // A check that threw before judging ends here too.
    judged(false);
  }
  return true;
}
