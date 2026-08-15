-- 0018 — The 27 governorates, as reference data
--
-- These rows used to live in `seed.sql`, which was a deployment bug rather than
-- a stylistic choice. `supabase db reset` applies the seed; `supabase db push`
-- — the command that populates a hosted project — applies migrations only. A
-- production deploy therefore came up with an empty `governorates` table, and
-- with it:
--
--   · no governorate to choose at checkout, so no order could be placed;
--   · an empty delivery-pricing screen in the admin console, so the fees could
--     not be entered either.
--
-- The distinction that fixes it: the 27 governorates are not sample data. They
-- are the fixed administrative divisions of Egypt, the same on every deployment
-- — reference data, and reference data belongs in a migration. The products and
-- brands in `seed.sql` are genuinely samples and stay there.
--
-- Idempotent, so it is safe against a database that already has them from the
-- seed. `on conflict (lower(name_en))` matches the unique index in 0003.

-- ---------------------------------------------------------------------------
-- Coverage and pricing are deliberately NOT decided here.
--
-- Every row lands inactive with a zero fee, and the business sets both from
-- /admin/governorates — that screen is the single source of truth for what
-- delivery costs (FR-056a). Writing a fee into a migration would be exactly the
-- hard-coding this project is built to avoid: changing it would then need a
-- developer, a pull request and a deploy.
--
-- Consequence worth stating plainly: immediately after `db push` the shop
-- serves nowhere. Activating the first governorate and setting its fee and
-- minimum is a launch step, and it is on the post-deploy checklist.
-- ---------------------------------------------------------------------------
insert into public.governorates (name_ar, name_en, sort_order) values
  ('القاهرة',        'Cairo',            1),
  ('الجيزة',         'Giza',             2),
  ('الإسكندرية',     'Alexandria',       3),
  ('القليوبية',      'Qalyubia',         4),
  ('الشرقية',        'Sharqia',          5),
  ('الدقهلية',       'Dakahlia',         6),
  ('البحيرة',        'Beheira',          7),
  ('المنوفية',       'Monufia',          8),
  ('الغربية',        'Gharbia',          9),
  ('كفر الشيخ',      'Kafr El Sheikh',  10),
  ('دمياط',          'Damietta',        11),
  ('بورسعيد',        'Port Said',       12),
  ('الإسماعيلية',    'Ismailia',        13),
  ('السويس',         'Suez',            14),
  ('شمال سيناء',     'North Sinai',     15),
  ('جنوب سيناء',     'South Sinai',     16),
  ('الفيوم',         'Faiyum',          17),
  ('بني سويف',       'Beni Suef',       18),
  ('المنيا',         'Minya',           19),
  ('أسيوط',          'Asyut',           20),
  ('سوهاج',          'Sohag',           21),
  ('قنا',            'Qena',            22),
  ('الأقصر',         'Luxor',           23),
  ('أسوان',          'Aswan',           24),
  ('البحر الأحمر',   'Red Sea',         25),
  ('الوادي الجديد',  'New Valley',      26),
  ('مطروح',          'Matrouh',         27)
on conflict (lower(name_en)) do nothing;
