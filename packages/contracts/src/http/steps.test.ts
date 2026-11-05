/**
 * @file   packages/contracts/src/http/steps.test.ts
 * @module contracts/http
 * @brief  The website's Discord steps header is read strictly; anything else means no steps.
 *
 * Responsibility: the website's own example decodes to its one step; [] is no steps; a wrong
 *                 ladder, a long name, an absolute or protocol-relative icon, more than three
 *                 entries, broken base64url or JSON and a header over 2 KB are refused (null).
 * Depends on:     vitest, ./steps
 * Spec:           docs/spec/07-integration-architecture.md §2.3
 */
import { describe, expect, it } from 'vitest';

import { parseSteps } from './steps.js';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

// Text → base64url of its UTF-8 bytes (no Node or DOM API in this package).
function base64url(text: string): string {
  const bytes = encodeURIComponent(text)
    .replace(/%([0-9A-F]{2})|./g, (m, hex: string | undefined) =>
      String.fromCharCode(hex === undefined ? m.charCodeAt(0) : parseInt(hex, 16)),
    )
    .split('')
    .map((c) => c.charCodeAt(0));
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const [a = 0, b = 0, c = 0] = bytes.slice(i, i + 3);
    const n = (a << 16) | (b << 8) | c;
    const chars = [18, 12, 6, 0].map((shift) => ALPHABET[(n >> shift) & 63] ?? '');
    out += chars.slice(0, Math.min(4, bytes.length - i + 1)).join('');
  }
  return out;
}

const encode = (value: unknown): string => base64url(JSON.stringify(value));

// The example from the website's "For the bingo side" (2026-11-04).
const EXAMPLE =
  'W3sibGFkZGVyIjoiaG9sZGVyIiwibmFtZSI6IkdvbGRlbiIsImljb24iOiIvbWVkaWEvc3RlcC1pY29ucy8wMTIzNDU2Nzg5YWJjZGVmMDEyMzQ1Njc4OWFiY2RlZi53ZWJwIn1d';

describe('the steps header', () => {
  it("reads the website's example and an empty list", () => {
    expect(parseSteps(EXAMPLE)).toEqual([
      {
        ladder: 'holder',
        name: 'Golden',
        icon: '/media/step-icons/0123456789abcdef0123456789abcdef.webp',
      },
    ]);
    expect(parseSteps(encode([]))).toEqual([]);
    expect(parseSteps(encode([{ ladder: 'farmer', name: 'Seed', icon: null }]))).toEqual([
      { ladder: 'farmer', name: 'Seed', icon: null },
    ]);
  });

  it.each([
    ['a wrong ladder', encode([{ ladder: 'whale', name: 'X', icon: null }])],
    ['a long name', encode([{ ladder: 'holder', name: 'x'.repeat(41), icon: null }])],
    [
      'an absolute icon',
      encode([{ ladder: 'holder', name: 'X', icon: 'https://evil.example/a.png' }]),
    ],
    [
      'a protocol-relative icon',
      encode([{ ladder: 'holder', name: 'X', icon: '//evil.example/a' }]),
    ],
    ['a relative icon', encode([{ ladder: 'holder', name: 'X', icon: 'media/a.webp' }])],
    ['four entries', encode(Array(4).fill({ ladder: 'investor', name: 'X', icon: null }))],
    ['no array', encode({ ladder: 'holder', name: 'X', icon: null })],
    ['broken base64url', '%%%'],
    ['broken JSON', base64url('[{')],
    ['a header over 2 KB', 'A'.repeat(2049)],
  ])('refuses %s', (_what, header) => {
    expect(parseSteps(header)).toBeNull();
  });
});
