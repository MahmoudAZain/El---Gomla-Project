import { describe, it, expect } from 'vitest';
import {
  categorySchema,
  productSchema,
  promotionSchema,
  governorateSchema,
} from '@/lib/validation/admin-schemas';
import { describeWriteError } from '@/lib/actions/admin/errors';
import { slugify } from '@/lib/slug';
import { poundsToPiastres, piastresToPounds } from '@/lib/money';

/**
 * The admin console's input layer.
 *
 * **What this file does not test is the authorization itself.** That lives in
 * Row Level Security and is asserted against a real database in
 * `supabase/tests/admin.test.sql`, under real roles with real JWT claims — a
 * mocked Supabase client would only prove that a mock refuses, which is worth
 * nothing (Constitution Principle II).
 *
 * What is tested here is everything that runs before the database is reached:
 * the refusals a person actually sees, and the money conversions that decide
 * what a driver collects. These run in CI without a database.
 */

const validProduct = {
  name_ar: 'لبن كامل الدسم',
  name_en: 'Full Fat Milk',
  category_id: '11111111-1111-4111-8111-111111111111',
  price: '45.50',
  unit: 'piece',
  storage: 'chilled',
  sku: 'MILK-1L',
  stock_qty: '40',
  min_order_qty: '1',
  is_active: 'on',
};

describe('bilingual master data (FR-057)', () => {
  it('refuses a category with no Arabic name', () => {
    const result = categorySchema.safeParse({
      name_ar: '   ',
      name_en: 'Dairy',
      is_active: 'on',
    });
    expect(result.success).toBe(false);
  });

  it('refuses a category with no English name', () => {
    const result = categorySchema.safeParse({
      name_ar: 'ألبان',
      name_en: '',
      is_active: 'on',
    });
    expect(result.success).toBe(false);
  });

  it('accepts a category with both', () => {
    const result = categorySchema.safeParse({
      name_ar: 'ألبان',
      name_en: 'Dairy',
      is_active: 'on',
    });
    expect(result.success).toBe(true);
  });

  it('refuses a product missing the Arabic name — the shop is Arabic-first', () => {
    const result = productSchema.safeParse({ ...validProduct, name_ar: '' });
    expect(result.success).toBe(false);
  });
});

describe('money at the form boundary (research R5)', () => {
  it('stores a typed price as integer piastres', () => {
    const result = productSchema.safeParse(validProduct);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.price).toBe(4550);
  });

  it('refuses a price that is not a plain amount', () => {
    const result = productSchema.safeParse({ ...validProduct, price: '45.5.5' });
    expect(result.success).toBe(false);
  });

  it('refuses three decimal places rather than rounding silently', () => {
    expect(poundsToPiastres('45.555')).toBeNull();
  });

  it('round-trips a fee through the admin form without drift', () => {
    for (const piastres of [0, 1, 999, 2500, 123_456]) {
      expect(poundsToPiastres(piastresToPounds(piastres))).toBe(piastres);
    }
  });
});

describe('delivery pricing is data, editable at any time (FR-056)', () => {
  const id = '22222222-2222-4222-8222-222222222222';

  it('accepts a changed fee and minimum as piastres', () => {
    const result = governorateSchema.safeParse({
      id,
      delivery_fee: '40.00',
      min_order_value: '150.00',
      is_active: 'on',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.delivery_fee).toBe(4000);
      expect(result.data.min_order_value).toBe(15_000);
      expect(result.data.is_active).toBe(true);
    }
  });

  it('accepts a free delivery fee — zero is a decision, not a mistake', () => {
    const result = governorateSchema.safeParse({
      id,
      delivery_fee: '0',
      min_order_value: '0',
      is_active: 'on',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.delivery_fee).toBe(0);
  });

  it('reads an unchecked coverage box as not delivering', () => {
    const result = governorateSchema.safeParse({
      id,
      delivery_fee: '25.00',
      min_order_value: '0',
      is_active: '',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.is_active).toBe(false);
  });

  it('refuses a fee typed as words rather than saving something wrong', () => {
    const result = governorateSchema.safeParse({
      id,
      delivery_fee: 'free',
      min_order_value: '0',
      is_active: 'on',
    });
    expect(result.success).toBe(false);
  });
});

describe('promotions (FR-055)', () => {
  const base = {
    name_ar: 'عرض',
    name_en: 'Promo',
    starts_at: '2026-01-01T00:00',
    ends_at: '2026-01-31T00:00',
    scope: 'catalog' as const,
    is_active: 'on',
  };

  it('refuses a percentage above 100', () => {
    const result = promotionSchema.safeParse({
      ...base,
      discount_type: 'percent',
      discount_value: '150',
    });
    expect(result.success).toBe(false);
  });

  it('refuses a window that ends before it starts', () => {
    const result = promotionSchema.safeParse({
      ...base,
      discount_type: 'percent',
      discount_value: '10',
      ends_at: '2025-12-01T00:00',
    });
    expect(result.success).toBe(false);
  });

  it('refuses a scoped promotion with no target chosen', () => {
    const result = promotionSchema.safeParse({
      ...base,
      scope: 'product',
      scope_id: null,
      discount_type: 'percent',
      discount_value: '10',
    });
    expect(result.success).toBe(false);
  });

  it('accepts a catalog-wide fixed discount', () => {
    const result = promotionSchema.safeParse({
      ...base,
      discount_type: 'fixed',
      discount_value: '5.00',
    });
    expect(result.success).toBe(true);
  });
});

describe('refusals a person can act on (FR-061)', () => {
  it('turns a foreign-key refusal into "deactivate instead"', () => {
    expect(describeWriteError({ code: '23503' })).toBe('adminErrors.inUseDeactivateInstead');
  });

  it('names a duplicate SKU or slug as a duplicate', () => {
    expect(describeWriteError({ code: '23505' })).toBe('adminErrors.duplicate');
  });

  it('reports a policy refusal as not authorized', () => {
    expect(describeWriteError({ code: '42501' })).toBe('adminErrors.notAuthorized');
  });

  it('recognises the category-depth guard', () => {
    expect(describeWriteError({ message: 'category_too_deep: categories may nest at most 3' })).toBe(
      'adminErrors.categoryTooDeep',
    );
  });

  it('falls back to a generic message rather than leaking Postgres text', () => {
    expect(describeWriteError({ code: '22P02', message: 'invalid input syntax for type uuid' })).toBe(
      'adminErrors.saveFailed',
    );
  });
});

describe('slugs come from the English name', () => {
  it('builds a readable slug', () => {
    expect(slugify('Full Fat Milk 1L')).toBe('full-fat-milk-1l');
  });

  it('returns null for a name with nothing sluggable, so the caller can say so', () => {
    expect(slugify('لبن')).toBeNull();
  });
});
