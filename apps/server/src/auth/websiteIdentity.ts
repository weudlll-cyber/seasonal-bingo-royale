/**
 * @file   apps/server/src/auth/websiteIdentity.ts
 * @module server/auth
 * @brief  Website mode: the visitor the website's proxy names in request headers (D37).
 *
 * Responsibility: decide whether a TCP peer is one of SBR_TRUSTED_PROXIES (addresses and CIDR
 *                 ranges, IPv4 and IPv6; an IPv4-mapped IPv6 peer counts as its IPv4 address),
 *                 and read the four identity headers (names from the settings) into a checked
 *                 identity: a stable id, a display name made fit for the game (letters, digits,
 *                 "_", "." and "-", 3–24 characters), the website roles and whether the e-mail
 *                 is verified; map the website roles to game roles. Only GET <base>auth/website
 *                 calls this; no other code reads the headers. No I/O.
 * Depends on:     node:net, node:crypto, ../config/env (types)
 * Used by:        ../http/routes/websiteSignIn, ./websiteAccounts
 * Spec:           docs/spec/07-integration-architecture.md §2.1, §2.3; docs/spec/03-security-architecture.md §2.2
 */
import { createHash } from 'node:crypto';
import { BlockList, isIPv4, isIPv6 } from 'node:net';

import type { Env } from '../config/env.js';

export interface WebsiteIdentity {
  readonly subject: string;
  // The name as the website sent it (kept to notice a change) and as the game uses it.
  readonly websiteName: string;
  readonly displayName: string;
  readonly roles: readonly string[];
  readonly emailVerified: boolean;
}

// "::ffff:172.18.0.3" (an IPv4 peer on a dual-stack socket) → "172.18.0.3".
const plain = (address: string): string => address.replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/, '');

function familyOf(address: string): 'ipv4' | 'ipv6' | null {
  if (isIPv4(address)) return 'ipv4';
  return isIPv6(address) ? 'ipv6' : null;
}

// A test for the peer address: in one of the trusted addresses or ranges. Entries that are
// no address (e.g. Fastify's "uniquelocal" keyword) trust nobody here.
export function trustedPeers(entries: readonly string[]): (peer: string | undefined) => boolean {
  const list = new BlockList();
  for (const entry of entries) {
    const [address = '', bits] = entry.split('/');
    const family = familyOf(address);
    if (family === null) continue;
    if (bits === undefined) list.addAddress(address, family);
    else list.addSubnet(address, Number(bits), family);
  }
  return (peer) => {
    if (peer === undefined) return false;
    const address = plain(peer);
    const family = familyOf(address);
    return family !== null && list.check(address, family);
  };
}

const SUBJECT = /^[\w.@:-]{1,128}$/;
const NAME_CHARS = /[^\p{L}\p{N}_.-]+/gu;
// A high surrogate left alone at the end of a cut string.
const CUT_PAIR = /[\uD800-\uDBFF]$/;

// The website's name in the game's characters, at most 24 (cut never inside a surrogate
// pair); a name with fewer than 3 usable characters becomes "player-" and six characters
// of the id's hash.
export function gameName(websiteName: string, subject: string): string {
  const cleaned = websiteName.trim().replace(NAME_CHARS, '_').slice(0, 24).replace(CUT_PAIR, '');
  if (cleaned.replace(/_/g, '').length >= 3) return cleaned;
  return `player-${createHash('sha256').update(subject).digest('hex').slice(0, 6)}`;
}

type Headers = Readonly<Record<string, string | string[] | undefined>>;

const one = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? undefined : value?.trim();

// The identity in the headers, or null without a valid id or a name.
export function identityFrom(headers: Headers, env: Env): WebsiteIdentity | null {
  const subject = one(headers[env.SBR_WEBSITE_HEADER_ID]);
  const websiteName = one(headers[env.SBR_WEBSITE_HEADER_NAME]);
  if (subject === undefined || !SUBJECT.test(subject) || !websiteName) return null;
  const roles = (one(headers[env.SBR_WEBSITE_HEADER_ROLES]) ?? '')
    .split(',')
    .map((r) => r.trim().toLowerCase())
    .filter((r) => r.length > 0);
  return {
    subject,
    websiteName: websiteName.slice(0, 128),
    displayName: gameName(websiteName, subject),
    roles,
    emailVerified: one(headers[env.SBR_WEBSITE_HEADER_EMAIL_VERIFIED])?.toLowerCase() === 'true',
  };
}

// Website roles that let a player host (D37); no admin role is ever granted by mapping.
const HOST_ROLES = new Set(['organiser', 'organizer']);

export function mappedRoles(websiteRoles: readonly string[]): readonly string[] {
  return websiteRoles.some((r) => HOST_ROLES.has(r)) ? ['organizer'] : [];
}
