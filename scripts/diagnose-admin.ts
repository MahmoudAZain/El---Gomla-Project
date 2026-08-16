/**
 * Reports why an admin cannot sign in, without anyone having to look at a
 * secret.
 *
 * "Incorrect mobile number or password" is the only thing the login form ever
 * says. That is deliberate — a form that distinguished "no such number" from
 * "wrong password" would be a way to discover which numbers hold accounts
 * (FR-014) — but it means the person locked out has no information at all.
 *
 * This runs where the credentials already are: inside GitHub Actions, with the
 * secrets the deploy uses. It reports the state of the account and, most
 * usefully, *attempts the sign-in itself* through the ordinary anon client. If
 * that succeeds, the stored password is right and the problem is what is being
 * typed. If it fails, the account and the secret genuinely disagree.
 *
 * It prints no secret and no password — only facts about the account.
 *
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… \
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=… ADMIN_PASSWORD=… \
 *   node --experimental-strip-types scripts/diagnose-admin.ts --phone 01001234567
 */

import { createClient } from '@supabase/supabase-js';
import { tryNormalizePhone, phoneToAuthIdentifier } from '../src/lib/phone.ts';

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

function die(message: string): never {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const password = process.env.ADMIN_PASSWORD?.trim();

if (!rawUrl) die('NEXT_PUBLIC_SUPABASE_URL is not set.');
if (!serviceKey) die('SUPABASE_SERVICE_ROLE_KEY is not set.');

const parsed = URL.parse(rawUrl);
if (!parsed) die(`NEXT_PUBLIC_SUPABASE_URL is not a valid URL: "${rawUrl}"`);
const url = parsed.origin;

const rawPhone = arg('phone');
if (!rawPhone) die('Pass --phone, e.g. --phone 01001234567');

const phone = tryNormalizePhone(rawPhone);
if (!phone) die(`"${rawPhone}" is not a valid Egyptian mobile number.`);

const email = phoneToAuthIdentifier(phone);
const service = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

console.log('\n─── account ───────────────────────────────');
console.log(`  you typed      ${rawPhone}`);
console.log(`  normalizes to  ${phone}`);
console.log(`  looked up as   ${email}`);

// ---------------------------------------------------------------------------
// The credential
// ---------------------------------------------------------------------------
const { data: list, error: listError } = await service.auth.admin.listUsers();
if (listError) die(`Could not list auth users: ${listError.message}`);

const user = list.users.find((u) => u.email === email);

if (!user) {
  console.log('\n✗ No auth user with that identity.');
  console.log('  Run "Create the first admin account" for this number.\n');
  process.exit(1);
}

console.log('\n─── credential (auth.users) ───────────────');
console.log(`  exists         yes`);
console.log(`  created        ${user.created_at}`);
console.log(`  confirmed      ${user.email_confirmed_at ?? 'NO — sign-in will be refused'}`);
console.log(`  last sign-in   ${user.last_sign_in_at ?? 'never'}`);
console.log(`  banned until   ${(user as { banned_until?: string }).banned_until ?? 'not banned'}`);

// ---------------------------------------------------------------------------
// The identity the app actually reads. A credential without this row produces
// a login that succeeds and is then refused by every policy.
// ---------------------------------------------------------------------------
const { data: profile } = await service
  .from('profiles')
  .select('id, full_name, phone, role')
  .eq('id', user.id)
  .maybeSingle();

console.log('\n─── identity (public.profiles) ────────────');
if (!profile) {
  console.log('  ✗ MISSING — the login would work and then be refused everywhere.');
} else {
  console.log(`  name           ${profile.full_name}`);
  console.log(`  phone          ${profile.phone}${profile.phone === phone ? '' : '  ← does not match!'}`);
  console.log(`  role           ${profile.role}${profile.role === 'admin' ? '' : '  ← not an admin'}`);
}

// ---------------------------------------------------------------------------
// Rate limiting. Five failures in the window and every further attempt is
// refused for a time — including one with the right password.
// ---------------------------------------------------------------------------
const since = new Date(Date.now() - 15 * 60_000).toISOString();
const { count } = await service
  .from('login_attempts')
  .select('id', { count: 'exact', head: true })
  .eq('phone', phone)
  .eq('succeeded', false)
  .gte('attempted_at', since);

console.log('\n─── recent failures ───────────────────────');
console.log(`  last 15 min    ${count ?? 0}${(count ?? 0) >= 5 ? '  ← locked out; wait for the window to pass' : ''}`);

// ---------------------------------------------------------------------------
// The question that actually matters: does the stored password work?
//
// Attempted through the anon client, exactly as the login form does, so the
// answer is about the real path and not a theory about it.
// ---------------------------------------------------------------------------
console.log('\n─── does the stored password work? ────────');

if (!anonKey) {
  console.log('  skipped — NEXT_PUBLIC_SUPABASE_ANON_KEY is not set');
} else if (!password) {
  console.log('  skipped — ADMIN_PASSWORD is not set');
} else {
  const anon = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: signIn, error: signInError } = await anon.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError) {
    console.log(`  ✗ NO — ${signInError.message}`);

    // The failure has to be read, not assumed. This script's first version
    // reported every refusal as "the password disagrees", and the real answer
    // was `Invalid API key` sitting in the line directly above it — a rejection
    // that happens before any credential is examined, and points at an entirely
    // different setting. Reporting a symptom as a cause is the thing this
    // script exists to stop, so it should not do it either.
    const message = signInError.message.toLowerCase();

    if (message.includes('api key')) {
      console.log('\n  ✗ This is NOT about the password. Supabase refused the key');
      console.log('    before looking at any credential.');
      console.log('\n    NEXT_PUBLIC_SUPABASE_ANON_KEY is wrong. Copy the Publishable');
      console.log('    key (or the legacy `anon` key) from Project Settings → API Keys,');
      console.log('    update that secret, then RE-RUN DEPLOY — the value is built into');
      console.log('    the site, so changing the secret alone changes nothing.');
      console.log('\n    The same wrong key is why the catalogue looks empty: every');
      console.log('    query is refused the same way.\n');
    } else if (message.includes('email not confirmed')) {
      console.log('\n    The account is not confirmed. It should have been created');
      console.log('    already confirmed — re-run the admin workflow.\n');
    } else {
      console.log('\n  The account and BOOTSTRAP_ADMIN_PASSWORD disagree. Set that');
      console.log('  secret to a password you choose, then run the admin workflow');
      console.log('  again with "reset password" ticked.\n');
    }

    process.exit(1);
  }

  console.log('  ✓ YES — the stored password signs in successfully.');
  console.log(`    session for ${signIn.user?.email}`);
  console.log('\n  So the account is fine and the secret is correct. What is being');
  console.log('  typed into the form is not that password — check for a stray');
  console.log('  space, or a different keyboard layout.\n');
}
