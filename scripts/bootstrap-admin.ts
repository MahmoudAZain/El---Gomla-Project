/**
 * Creates the first admin account on a hosted project.
 *
 * Staff accounts are created by an administrator and never self-registered
 * (FR-060), which leaves a chicken-and-egg problem on a fresh deployment: the
 * admin console is the only place staff are made, and nobody can reach it yet.
 * This script breaks that cycle exactly once.
 *
 * It cannot be a migration. Two reasons, both fatal:
 *
 *   1. A password has to be hashed by Supabase Auth, through the Admin API.
 *      SQL cannot produce a hash GoTrue will later accept.
 *   2. A migration is committed. Any credential inside one is a published
 *      credential, and a default admin password in a public repository is the
 *      whole security model gone.
 *
 * So it runs once, by hand, against a password the operator chooses and never
 * writes down here.
 *
 * Two rows are needed, not one. `auth.users` holds the credential; the app's
 * notion of who someone is lives in `public.profiles`, and `is_admin()` reads
 * `profiles.role`. There is no trigger linking them — registration writes both
 * explicitly — so an account created through the Supabase dashboard alone gets
 * a login that is refused at every RLS policy. That failure is confusing enough
 * to be worth preventing, which is why this exists rather than a doc note.
 *
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<key> \
 *   ADMIN_PASSWORD='<chosen password>' \
 *   node --experimental-strip-types scripts/bootstrap-admin.ts \
 *     --phone 01001234567 --name 'Mahmoud Zain'
 *
 * Safe to re-run: an existing account is promoted rather than duplicated, and
 * the password is left alone.
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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.ADMIN_PASSWORD;

if (!url) die('NEXT_PUBLIC_SUPABASE_URL is not set.');
if (!serviceKey) die('SUPABASE_SERVICE_ROLE_KEY is not set. Find it in Supabase → Settings → API.');

const rawPhone = arg('phone');
const fullName = arg('name');

if (!rawPhone) die('Pass --phone, e.g. --phone 01001234567');
if (!fullName) die("Pass --name, e.g. --name 'Mahmoud Zain'");

// Normalized by the same function the storefront uses, so this account's phone
// is byte-identical to what a login will look up. A near-miss here produces an
// account that exists but can never sign in.
const phone = tryNormalizePhone(rawPhone);
if (!phone) die(`"${rawPhone}" is not a valid Egyptian mobile number.`);

if (!password || password.length < 8) {
  die('Set ADMIN_PASSWORD to at least 8 characters. Choose it now — it is not stored anywhere in this repository.');
}

const email = phoneToAuthIdentifier(phone);
const service = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

console.log(`\nBootstrapping admin on ${url}`);
console.log(`  phone    ${phone}`);
console.log(`  identity ${email}`);

// ---------------------------------------------------------------------------
// Already there?
//
// Re-running after a half-finished attempt is the common case — the auth user
// was created and something later failed — so promotion has to be a supported
// path, not an error.
// ---------------------------------------------------------------------------
const { data: existingProfile } = await service
  .from('profiles')
  .select('id, role, full_name')
  .eq('phone', phone)
  .maybeSingle();

if (existingProfile) {
  if (existingProfile.role === 'admin') {
    console.log(`\n✓ ${existingProfile.full_name} is already an admin. Nothing to do.\n`);
    process.exit(0);
  }

  const { error } = await service
    .from('profiles')
    .update({ role: 'admin' })
    .eq('id', existingProfile.id);

  if (error) die(`Could not promote the existing account: ${error.message}`);

  console.log(`\n✓ Promoted ${existingProfile.full_name} from ${existingProfile.role} to admin.\n`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Create the credential, then the identity.
// ---------------------------------------------------------------------------
const { data: created, error: authError } = await service.auth.admin.createUser({
  email,
  password,
  // Nothing can confirm a synthetic address on a non-routable domain, so the
  // account is created already confirmed. Without this the first sign-in waits
  // forever for an email that cannot arrive (research R2).
  email_confirm: true,
});

let userId = created?.user?.id;

if (authError || !userId) {
  // An auth user with no profile is exactly the stranded state described above,
  // and it is recoverable: adopt it rather than making the operator delete a
  // user through the dashboard to get past this.
  if (authError?.message?.includes('already been registered')) {
    const { data: list } = await service.auth.admin.listUsers();
    const found = list?.users.find((u) => u.email === email);
    if (!found) die(`An auth user for ${email} exists but could not be read back.`);
    userId = found.id;
    console.log('  · auth user already existed — attaching a profile to it');
  } else {
    die(`Could not create the auth user: ${authError?.message ?? 'unknown error'}`);
  }
}

const { error: profileError } = await service.from('profiles').insert({
  id: userId,
  full_name: fullName,
  phone,
  role: 'admin',
  preferred_locale: 'ar',
});

if (profileError) {
  // Only clean up a user this run created. Deleting one that was already there
  // would destroy an account the operator may be mid-way through fixing.
  if (created?.user?.id) await service.auth.admin.deleteUser(created.user.id);
  die(`Could not create the profile: ${profileError.message}`);
}

console.log(`\n✓ Admin created. Sign in at /ar/login with ${phone} and the password you chose.`);
console.log('  Create the rest of the staff from /ar/admin/staff — this script is not needed again.\n');
