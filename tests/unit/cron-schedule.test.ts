import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { SCHEDULE, normalizeCron } from '../../worker/schedule';

/**
 * The scheduled jobs are declared in two places that must agree: the cron
 * expressions in `wrangler.jsonc`, and the map in `worker/schedule.ts` that
 * turns a fired cron into the route it should call.
 *
 * A disagreement between them fails the worst possible way — silently. The
 * handler logs "no job mapped" to a place nobody reads and returns, so the job
 * simply never runs. For the keep-alive that means the free-tier database
 * pauses after a quiet week and the shop goes offline; for the export it means
 * the only backup this system has quietly stops being taken.
 *
 * The first deploy also proved Cloudflare validates these strings server-side
 * and refuses some that other cron implementations accept, so the shape of the
 * expressions is checked here rather than discovered at deploy time.
 */

const ROOT = resolve(import.meta.dirname, '../..');

/**
 * The crons array out of `wrangler.jsonc`.
 *
 * Deliberately not a JSON parse: the file is JSONC and contains `//` comments,
 * while `"http://localhost:3000"` contains a `//` that is not one. Pulling out
 * the array first and then reading its quoted strings avoids having to tell
 * those apart.
 */
function declaredCrons(): string[] {
  const source = readFileSync(resolve(ROOT, 'wrangler.jsonc'), 'utf8');
  const block = /"crons"\s*:\s*\[([^\]]*)\]/.exec(source);
  if (!block?.[1]) throw new Error('no "crons" array found in wrangler.jsonc');
  return [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1] as string);
}

describe('cron schedule', () => {
  const crons = declaredCrons();

  it('declares the four jobs the free tier requires', () => {
    expect(crons).toHaveLength(4);
  });

  it('maps every declared cron to a route', () => {
    for (const cron of crons) {
      expect(SCHEDULE[normalizeCron(cron)], `no route mapped for cron "${cron}"`).toBeDefined();
    }
  });

  it('declares every mapped route as a cron', () => {
    const declared = new Set(crons.map(normalizeCron));
    for (const cron of Object.keys(SCHEDULE)) {
      expect(declared.has(cron), `"${cron}" is mapped but never fires`).toBe(true);
    }
  });

  it('points every route at a handler that exists', () => {
    for (const route of Object.values(SCHEDULE)) {
      const file = resolve(ROOT, 'src/app', route.replace(/^\//, ''), 'route.ts');
      expect(existsSync(file), `${route} has no handler at ${file}`).toBe(true);
    }
  });

  /**
   * The bug that produced this file. Cloudflare rejected `0 4 * * 0` with
   * `invalid cron string [code: 10100]`, and its published day-of-week
   * numbering is described as 0-6 in some places and 1-7 in others. A name is
   * accepted and means the same day either way.
   */
  it('names the day of week rather than numbering it', () => {
    for (const cron of crons) {
      const dayOfWeek = normalizeCron(cron).split(' ')[4];
      if (dayOfWeek === '*') continue;
      expect(
        dayOfWeek,
        `"${cron}" numbers the day of week; Cloudflare rejects 0 and its numbering is ambiguous — use sun/mon/…`,
      ).toMatch(/^(sun|mon|tue|wed|thu|fri|sat)(-(sun|mon|tue|wed|thu|fri|sat))?$/);
    }
  });

  it('uses five fields, as Cloudflare expects', () => {
    for (const cron of crons) {
      expect(normalizeCron(cron).split(' '), `"${cron}" is not a 5-field expression`).toHaveLength(5);
    }
  });
});

describe('normalizeCron', () => {
  it('is case-insensitive, so SUN and sun are one schedule', () => {
    expect(normalizeCron('0 4 * * SUN')).toBe('0 4 * * sun');
  });

  it('collapses whitespace', () => {
    expect(normalizeCron('  0   4 *  * sun ')).toBe('0 4 * * sun');
  });

  it('leaves an already-normal expression alone', () => {
    expect(normalizeCron('0 3 * * *')).toBe('0 3 * * *');
  });
});
