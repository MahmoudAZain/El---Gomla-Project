-- Bilingual search (T113, SC-004, FR-019).
--
-- The requirement is that a shopper finds a product by typing what they would
-- actually type — which for Arabic means with any of several spellings, with or
-- without diacritics, and usually only part of the word.
--
-- Postgres ships no Arabic dictionary, so this is trigram matching over a
-- normalized column rather than full-text search. Normalization folds alef and
-- ta-marbuta variants and strips tashkeel on *both* sides of the comparison,
-- which is what makes مياه and مياة find each other (research R10).

insert into public.categories (id, name_ar, name_en, slug)
values ('51000000-0000-4000-8000-00000000000a', 'مشروبات', 'SearchCat', 'search-cat');

insert into public.brands (id, name_ar, name_en, slug)
values ('52000000-0000-4000-8000-00000000000a', 'جهينة', 'Juhayna', 'juhayna-search');

insert into public.products
  (id, category_id, brand_id, name_ar, name_en, description_ar, slug, price, unit, sku, stock_qty)
values
  ('53000000-0000-4000-8000-00000000000a', '51000000-0000-4000-8000-00000000000a',
   '52000000-0000-4000-8000-00000000000a',
   'مياه معدنية', 'Mineral Water', 'مياه نقية', 'mineral-water', 1000, 'piece', 'SRCH-A', 50),

  -- The same word written the other common way, with ta marbuta.
  ('53000000-0000-4000-8000-00000000000b', '51000000-0000-4000-8000-00000000000a', null,
   'مياة غازية', 'Sparkling Water', null, 'sparkling-water', 1500, 'piece', 'SRCH-B', 50),

  -- Fully vowelled, as a careful typist or a label might write it.
  ('53000000-0000-4000-8000-00000000000c', '51000000-0000-4000-8000-00000000000a', null,
   'لَبَن كَامِل الدَّسَم', 'Full Fat Milk', null, 'full-fat-milk', 4500, 'piece', 'SRCH-C', 50),

  -- Inactive: must never surface, however well it matches.
  ('53000000-0000-4000-8000-00000000000d', '51000000-0000-4000-8000-00000000000a', null,
   'مياه مخفية', 'Hidden Water', null, 'hidden-water', 900, 'piece', 'SRCH-D', 50),

  -- Hamza-alef, to prove alef forms fold together.
  ('53000000-0000-4000-8000-00000000000e', '51000000-0000-4000-8000-00000000000a', null,
   'أرز مصري', 'Egyptian Rice', null, 'egyptian-rice', 3000, 'piece', 'SRCH-E', 50);

update public.products set is_active = false
where id = '53000000-0000-4000-8000-00000000000d';

select auth.browse_anonymously();

-- ===========================================================================
-- 1-4. The same product, either language
-- ===========================================================================
select public.assert('search', '1 found by its Arabic name',
  (select count(*) from public.search_products('مياه معدنية')
   where id = '53000000-0000-4000-8000-00000000000a') = 1);

select public.assert('search', '2 found by its English name',
  (select count(*) from public.search_products('Mineral Water')
   where id = '53000000-0000-4000-8000-00000000000a') = 1);

-- Shoppers type fragments, not whole names. Full-text search on `simple` fails
-- exactly here, which is why this is trigram matching.
select public.assert('search', '3 found by a partial Arabic word',
  (select count(*) from public.search_products('معدن')
   where id = '53000000-0000-4000-8000-00000000000a') = 1);

select public.assert('search', '4 found by a partial English word',
  (select count(*) from public.search_products('miner')
   where id = '53000000-0000-4000-8000-00000000000a') = 1);

-- ===========================================================================
-- 5-8. Spelling variation (SC-004)
-- ===========================================================================

-- The heart of it: مياه and مياة are the same word to a shopper, and folding
-- ta marbuta to ha on both sides is what makes each query find both products.
select public.assert('search', '5 مياه finds the product spelled مياة',
  (select count(*) from public.search_products('مياه')
   where id = '53000000-0000-4000-8000-00000000000b') = 1);

select public.assert('search', '6 مياة finds the product spelled مياه',
  (select count(*) from public.search_products('مياة')
   where id = '53000000-0000-4000-8000-00000000000a') = 1);

-- Diacritics are stripped, so an unvowelled query finds a vowelled name.
select public.assert('search', '7 an unvowelled query finds a vowelled name',
  (select count(*) from public.search_products('لبن كامل')
   where id = '53000000-0000-4000-8000-00000000000c') = 1);

-- ...and the reverse, for anyone with a keyboard that produces them.
select public.assert('search', '8 a vowelled query finds the same product',
  (select count(*) from public.search_products('لَبَن')
   where id = '53000000-0000-4000-8000-00000000000c') = 1);

-- Alef forms fold together too: أ, إ, آ and ا are one letter when searching.
select public.assert('search', '8b a bare alef finds a hamza-alef name',
  (select count(*) from public.search_products('ارز')
   where id = '53000000-0000-4000-8000-00000000000e') = 1);

-- ===========================================================================
-- 9-11. Brands, and what must not appear
-- ===========================================================================
select public.assert('search', '9 found by its brand name',
  (select count(*) from public.search_products('جهينة')
   where id = '53000000-0000-4000-8000-00000000000a') = 1);

-- An inactive product is invisible to search for the same reason it is
-- invisible everywhere else: the RLS policy, not a filter in the query.
select public.assert('search', '10 an inactive product never appears',
  (select count(*) from public.search_products('مياه')
   where id = '53000000-0000-4000-8000-00000000000d') = 0);

select public.assert('search', '11 a query matching nothing returns nothing',
  (select count(*) from public.search_products('zzzznotathing')) = 0);

-- ===========================================================================
-- 12-16. The listing wrapper — one round trip, with prices
-- ===========================================================================
select public.assert('search', '12 the listing wrapper finds the same product',
  (select count(*) from public.search_product_listing('مياه معدنية')
   where id = '53000000-0000-4000-8000-00000000000a') = 1);

-- The whole point of the wrapper: a result grid needs a price, and fetching it
-- per result would be a round trip per product from a Worker.
select public.assert('search', '13 a search result carries its price',
  (select effective_price from public.search_product_listing('مياه معدنية')
   where id = '53000000-0000-4000-8000-00000000000a') = 1000);

select public.assert('search', '14 a search result carries its category',
  (select category_slug from public.search_product_listing('مياه معدنية')
   where id = '53000000-0000-4000-8000-00000000000a') = 'search-cat');

select public.assert('search', '15 the count agrees with the rows returned',
  public.count_search_results('مياه')
  = (select count(*) from public.search_product_listing('مياه', 100, 0)));

select public.assert('search', '16 the inactive product is absent from the count too',
  public.count_search_results('مياه مخفية') = 0);

-- ===========================================================================
-- 17-19. Paging and ordering
-- ===========================================================================
select public.assert('search', '17 a limit is respected',
  (select count(*) from public.search_product_listing('مياه', 1, 0)) = 1);

select public.assert('search', '18 an offset moves past the first result',
  (select id from public.search_product_listing('مياه', 1, 0))
  is distinct from
  (select id from public.search_product_listing('مياه', 1, 1)));

-- A prefix match outranks a mention in a description: someone typing مياه
-- wants the water, not a product that merely refers to it.
select public.assert('search', '19 a prefix match is ordered first',
  (select id from public.search_products('مياه معدنية') limit 1)
  = '53000000-0000-4000-8000-00000000000a');

select auth.reset_role();
