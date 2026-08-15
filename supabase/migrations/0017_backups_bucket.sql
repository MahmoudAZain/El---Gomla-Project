-- 0017 — The backups bucket
--
-- The weekly export (T117) writes here. It is the only recovery point the
-- system has, because the Supabase free tier takes no backups and offers no
-- point-in-time recovery (research R13).
--
-- **Private, with no policy for any client role.** The file contains every
-- customer's phone number and delivery address, and every cost price. Product
-- images are public because a shopper must see them; a backup must be reachable
-- by nothing but the service role, which bypasses policies and is held only by
-- the scheduled Worker.

do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage schema absent — skipping backups bucket (expected outside Supabase)';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'backups',
    'backups',
    false,
    -- 50 MB. The export is newline-delimited JSON of a shop's whole history;
    -- well past this size, the free tier's 1 GB is the real constraint and the
    -- business needs the paid plan anyway.
    52428800,
    array['application/x-ndjson', 'application/json']
  )
  on conflict (id) do nothing;

  -- Deliberately no policies. Every client role — anon, authenticated, staff,
  -- admin — is refused. Only the service role can read or write here, and
  -- restoring is an operator task performed with that key in hand.
end $$;
