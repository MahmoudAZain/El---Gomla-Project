import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { clientEnv } from '../../src/lib/env';

/**
 * The Supabase dashboard shows more than one address, and picking the wrong one
 * fails in the worst way available: silently.
 *
 * The Data API page shows an API URL ending `/rest/v1`. Supplied as
 * `NEXT_PUBLIC_SUPABASE_URL`, every query becomes `…/rest/v1/rest/v1/<table>`,
 * the gateway refuses it, and the storefront renders an empty catalogue —
 * indistinguishable from a shop that simply has no products entered yet. On a
 * freshly deployed site, which genuinely has no products, there is nothing to
 * notice.
 *
 * So the shape is asserted at the boundary, where the message can name the
 * setting and say what to change.
 */

const VALID = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://abcdefghijklmnop.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_example',
  NEXT_PUBLIC_SITE_URL: 'https://el-gomala.example.workers.dev',
};

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = { ...process.env } as Record<string, string | undefined>;
  Object.assign(process.env, VALID);
});

afterEach(() => {
  for (const key of Object.keys(VALID)) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe('clientEnv', () => {
  it('accepts the project origin', () => {
    expect(clientEnv().NEXT_PUBLIC_SUPABASE_URL).toBe(VALID.NEXT_PUBLIC_SUPABASE_URL);
  });

  it('accepts a trailing slash', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://abcdefghijklmnop.supabase.co/';
    expect(() => clientEnv()).not.toThrow();
  });

  /** The exact mistake: copying the API URL off the Data API page. */
  it('rejects the Data API URL, naming what to use instead', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://abcdefghijklmnop.supabase.co/rest/v1';
    expect(() => clientEnv()).toThrow(/must be the project origin with no path/);
  });

  it('rejects any other path', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://abcdefghijklmnop.supabase.co/auth/v1';
    expect(() => clientEnv()).toThrow(/no path/);
  });

  it('still rejects something that is not a URL at all', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'abcdefghijklmnop.supabase.co';
    expect(() => clientEnv()).toThrow(/must be a valid URL/);
  });

  it('still requires the anon key', () => {
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = '';
    expect(() => clientEnv()).toThrow(/NEXT_PUBLIC_SUPABASE_ANON_KEY is required/);
  });
});
