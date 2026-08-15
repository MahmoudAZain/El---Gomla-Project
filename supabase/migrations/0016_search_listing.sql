-- 0016 — Search that returns what a listing needs
--
-- `search_products()` (migration 0010) returns `setof products`, which is the
-- right shape for a lookup and the wrong one for a shelf: a search result grid
-- shows a price, a discount badge and a photo, none of which live on `products`.
-- Rendering one would mean a second round trip per result from a Worker.
--
-- This wraps the same matching logic and returns the `product_listing` shape
-- instead, so a search page costs exactly one query — the thing SC-003's
-- three-second budget on Egyptian mobile data actually spends.
--
-- The matching itself is not reimplemented. It stays in one place so search
-- cannot start behaving differently depending on which entry point was used.

create or replace function public.search_product_listing(
  p_query  text,
  p_limit  integer default 24,
  p_offset integer default 0
)
returns setof public.product_listing
language sql
stable
set search_path = public
as $$
  select l.*
  from public.search_products(p_query, p_limit, p_offset) sp
  join public.product_listing l on l.id = sp.id
  -- search_products already ordered by prefix match then name; the join loses
  -- that, so it is restated here rather than left to the planner.
  order by
    (sp.search_text like public.search_normalize(p_query) || '%') desc,
    sp.name_ar
$$;

-- How many results there are in total, for the "showing 24 of 91" line and for
-- deciding whether a "load more" control belongs on the page at all.
create or replace function public.count_search_results(p_query text)
returns bigint
language sql
stable
set search_path = public
as $$
  select count(*)
  from public.products p
  left join public.brands b on b.id = p.brand_id
  where p.is_active
    and (
      p.search_text like '%' || public.search_normalize(p_query) || '%'
      or public.search_normalize(coalesce(b.name_ar, '') || ' ' || coalesce(b.name_en, ''))
         like '%' || public.search_normalize(p_query) || '%'
    )
$$;

grant execute on function public.search_product_listing(text, integer, integer) to anon, authenticated;
grant execute on function public.count_search_results(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Operational sweeps (T115, T116, T118)
--
-- The free tier gives 500 MB of database and 1 GB of storage, and nothing
-- reclaims either on its own. These are the jobs that keep the shop inside
-- those ceilings; the Worker cron calls them.
-- ---------------------------------------------------------------------------

/**
 * Bounds `login_attempts` (T115).
 *
 * The table exists to rate-limit sign-in over a fifteen-minute window, so
 * anything older than a day is dead weight. Left alone it is the fastest-growing
 * table in the system and the one most likely to fill the free tier.
 */
create or replace function public.sweep_login_attempts()
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  removed integer;
begin
  delete from public.login_attempts
  where attempted_at < now() - interval '1 day';

  get diagnostics removed = row_count;
  return removed;
end $$;

/**
 * Storage pressure (T118).
 *
 * Reports the bytes held in the product-images bucket so the cron can warn at
 * 700 MB — well before the 1 GB ceiling, because the failure mode past it is
 * that staff can no longer add products and will not know why.
 *
 * Returns nulls rather than raising where the storage schema is absent, so the
 * SQL test harness (plain Postgres) can still run this file.
 */
create or replace function public.storage_usage()
returns table (bytes bigint, object_count bigint)
language plpgsql
stable
security definer
set search_path = public, storage
as $$
begin
  if to_regclass('storage.objects') is null then
    return query select null::bigint, null::bigint;
    return;
  end if;

  return query
  execute $q$
    select
      coalesce(sum((metadata ->> 'size')::bigint), 0)::bigint,
      count(*)::bigint
    from storage.objects
    where bucket_id = 'product-images'
  $q$;
end $$;

/**
 * Storage objects no longer referenced by any photo row (T116).
 *
 * An upload that succeeded followed by a database write that failed leaves a
 * file nothing points at. `uploadProductPhoto` compensates for that case
 * itself, but a crashed request between the two cannot — so this catches what
 * the compensation misses.
 *
 * It **returns** the paths rather than deleting them. Deleting storage objects
 * from SQL is not possible through this schema, and a job that silently removed
 * files would be the wrong thing to trust blindly anyway.
 */
create or replace function public.orphan_image_paths(p_limit integer default 500)
returns table (storage_path text)
language plpgsql
stable
security definer
set search_path = public, storage
as $$
begin
  if to_regclass('storage.objects') is null then
    return;
  end if;

  return query
  execute format($q$
    select o.name::text
    from storage.objects o
    where o.bucket_id = 'product-images'
      and not exists (
        select 1 from public.product_photos p
        where p.storage_path = o.name or p.thumb_path = o.name
      )
      -- A file uploaded in the last hour may belong to a request still in
      -- flight. Only settled orphans are reported.
      and o.created_at < now() - interval '1 hour'
    limit %s
  $q$, greatest(least(p_limit, 5000), 1));
end $$;

-- These are called by the scheduled Worker with the service role, never by a
-- browser. No grant to anon or authenticated: a customer has no business
-- knowing how full the storage bucket is.
revoke all on function public.sweep_login_attempts() from anon, authenticated;
revoke all on function public.storage_usage() from anon, authenticated;
revoke all on function public.orphan_image_paths(integer) from anon, authenticated;
