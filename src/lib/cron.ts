import 'server-only';

import { serverEnv } from '@/lib/env';

/**
 * Authorization for the scheduled endpoints.
 *
 * These routes run sweeps and produce a full data export, so they must not be
 * open. They are guarded by a shared secret rather than by a user session,
 * because the caller is a scheduler and has no session.
 *
 * The comparison is length-checked then character-checked in constant time. A
 * naive `===` on a secret leaks its length and, in principle, its prefix
 * through timing — a small risk here, and a smaller cost to remove.
 */
export function cronSecretMatches(request: Request): boolean {
  const { CRON_SECRET } = serverEnv();

  const header = request.headers.get('authorization') ?? '';
  const presented = header.startsWith('Bearer ') ? header.slice(7) : '';

  if (presented.length !== CRON_SECRET.length) return false;

  let difference = 0;
  for (let i = 0; i < presented.length; i += 1) {
    difference |= presented.charCodeAt(i) ^ CRON_SECRET.charCodeAt(i);
  }
  return difference === 0;
}

/** A refusal that says nothing about why. */
export function cronRefusal(): Response {
  return new Response(JSON.stringify({ error: 'not_authorized' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}
