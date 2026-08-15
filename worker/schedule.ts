/**
 * Which cron expression runs which job. Mirrors `triggers.crons` in
 * `wrangler.jsonc`, and `tests/unit/cron-schedule.test.ts` asserts they agree.
 *
 * Its own module so that test can import it. `worker/index.ts` pulls in the
 * bundle `opennextjs-cloudflare build` generates, which does not exist until a
 * build has run — importing the map from there would make the test depend on a
 * build step.
 *
 * The weekly two say `sun` rather than `0`. Cloudflare's API rejects `0` in the
 * day-of-week field outright — `invalid cron string [code: 10100]` — and
 * published accounts of its numbering disagree over whether that field runs 0-6
 * or 1-7. A three-letter name means the same day under either reading, so it
 * cannot be silently off by one. That matters most for the export: it is the
 * only backup this system has, and a backup running on the wrong day is a
 * problem nobody notices until they need it.
 */
export const SCHEDULE: Record<string, string> = {
  '0 */6 * * *': '/api/cron/keepalive',
  '0 3 * * *': '/api/cron/sweep',
  '0 4 * * sun': '/api/cron/orphans',
  '0 5 * * sun': '/api/cron/export',
};

/**
 * Lower case, collapsed whitespace, trimmed.
 *
 * Cloudflare echoes the expression back as it was configured, so a lookup that
 * missed on capitalisation alone would drop the job in silence — the exact
 * failure the worker entry point exists to prevent.
 */
export function normalizeCron(expression: string): string {
  return expression.trim().toLowerCase().replace(/\s+/g, ' ');
}
