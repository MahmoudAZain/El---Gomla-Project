import { z } from 'zod';
import { poundsToPiastres } from '@/lib/money';
import { fullNameSchema, phoneSchema, passwordSchema, localeSchema } from './schemas';

/**
 * Schemas for the staff console.
 *
 * These are deliberately a separate file from `schemas.ts`, which states — and
 * must keep stating — that no schema there accepts a price, a discount or a
 * delivery fee, because no customer action does (FR-026).
 *
 * The admin console is the opposite case: setting those numbers *is* its job.
 * The distinction that keeps FR-026 intact is who may submit them. Every action
 * in `lib/actions/admin/` writes through the RLS-bound server client, so the
 * `is_admin()` policies decide whether the write lands. A customer posting one
 * of these payloads is refused by the database, not by the absence of a schema.
 */

const trimmed = (min: number, max: number) =>
  z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().min(min).max(max));

const optionalText = (max: number) =>
  z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().max(max))
    .optional()
    .or(z.literal(''));

/**
 * A money field on an admin form.
 *
 * Staff type pounds — `"45.50"` — because that is what a price list says. It
 * becomes integer piastres here, at the boundary, and stays an integer for the
 * rest of its life (research R5).
 */
const piastres = z
  .string()
  .refine((value) => poundsToPiastres(value) !== null, { error: 'adminErrors.amountInvalid' })
  .transform((value) => poundsToPiastres(value) as number);

/** Bilingual pair. Blank on either side is refused here and by the database (FR-057). */
const bilingualName = {
  name_ar: trimmed(2, 200),
  name_en: trimmed(2, 200),
};

const checkbox = z
  .union([z.literal('on'), z.literal('true'), z.literal('false'), z.literal(''), z.null()])
  .transform((value) => value === 'on' || value === 'true');

export const categorySchema = z.object({
  id: z.uuid().optional(),
  ...bilingualName,
  parent_id: z.uuid().nullable().optional(),
  sort_order: z.coerce.number().int().min(0).max(9999).default(0),
  is_active: checkbox,
});

export const brandSchema = z.object({
  id: z.uuid().optional(),
  ...bilingualName,
  is_active: checkbox,
});

export const productSchema = z.object({
  id: z.uuid().optional(),
  ...bilingualName,
  description_ar: optionalText(2000),
  description_en: optionalText(2000),
  category_id: z.uuid({ error: 'adminErrors.categoryRequired' }),
  brand_id: z.uuid().nullable().optional(),
  price: piastres,

  /**
   * Optional. A product with no cost recorded is normal — the margin report
   * simply excludes it — and an empty field must not be read as "free".
   */
  cost_price: piastres.optional().or(z.literal('').transform(() => undefined)),
  supplier_name: optionalText(120),

  unit: z.enum(['piece', 'kilo', 'carton', 'pack', 'liter']),
  storage: z.enum(['ambient', 'chilled', 'frozen']),
  pack_size: optionalText(40),
  units_per_carton: z.coerce.number().int().positive().max(10_000).optional().nullable(),
  weight_grams: z.coerce.number().int().positive().max(1_000_000).optional().nullable(),
  barcode: optionalText(40),
  sku: trimmed(1, 60),
  stock_qty: z.coerce.number().int().min(0).max(1_000_000),
  min_order_qty: z.coerce.number().int().positive().max(10_000).default(1),
  is_active: checkbox,
});

export const promotionSchema = z
  .object({
    id: z.uuid().optional(),
    ...bilingualName,
    discount_type: z.enum(['percent', 'fixed']),

    /**
     * Percent arrives as a whole number; fixed arrives as pounds. The two are
     * reconciled in `superRefine` below rather than by branching schemas, so a
     * mistyped percentage is a field error and not a database exception.
     */
    discount_value: trimmed(1, 12),

    starts_at: z.string().min(1, { error: 'adminErrors.startRequired' }),
    ends_at: z.string().min(1, { error: 'adminErrors.endRequired' }),

    /** Exactly one scope, or none for the whole catalog. */
    scope: z.enum(['catalog', 'product', 'category', 'brand']),
    scope_id: z.uuid().nullable().optional(),

    is_active: checkbox,
  })
  .superRefine((value, ctx) => {
    if (value.discount_type === 'percent') {
      const percent = Number(value.discount_value);
      if (!Number.isInteger(percent) || percent < 1 || percent > 100) {
        ctx.addIssue({
          code: 'custom',
          path: ['discount_value'],
          message: 'adminErrors.percentRange',
        });
      }
    } else if (poundsToPiastres(value.discount_value) === null) {
      ctx.addIssue({ code: 'custom', path: ['discount_value'], message: 'adminErrors.amountInvalid' });
    }

    if (value.scope !== 'catalog' && !value.scope_id) {
      ctx.addIssue({ code: 'custom', path: ['scope_id'], message: 'adminErrors.scopeTargetRequired' });
    }

    if (new Date(value.ends_at) <= new Date(value.starts_at)) {
      ctx.addIssue({ code: 'custom', path: ['ends_at'], message: 'adminErrors.endBeforeStart' });
    }
  });

/**
 * Delivery pricing for one governorate.
 *
 * Nothing about these numbers is fixed at build time. Fee, minimum and coverage
 * are all editable whenever the business decides — fuel goes up, a district
 * opens, a promotion drops the minimum for a week — and the change takes effect
 * on the next cart priced (FR-056).
 *
 * Orders already placed are unaffected: `orders` stores its own copy of the fee
 * and the governorate name at placement, so raising a fee never rewrites what a
 * customer was quoted or what the driver collects.
 */
export const governorateSchema = z.object({
  id: z.uuid(),
  delivery_fee: piastres,
  min_order_value: piastres,
  is_active: checkbox,
});

export const staffSchema = z.object({
  full_name: fullNameSchema,
  phone: phoneSchema,
  password: passwordSchema,
  role: z.enum(['staff', 'admin']),
  preferred_locale: localeSchema.default('ar'),
});

export const staffRoleSchema = z.object({
  profile_id: z.uuid(),
  role: z.enum(['customer', 'staff', 'admin']),
});

export const passwordResetSchema = z.object({
  profile_id: z.uuid(),
  password: passwordSchema,
});

export type CategoryInput = z.infer<typeof categorySchema>;
export type BrandInput = z.infer<typeof brandSchema>;
export type ProductInput = z.infer<typeof productSchema>;
export type PromotionInput = z.infer<typeof promotionSchema>;
export type GovernorateInput = z.infer<typeof governorateSchema>;
