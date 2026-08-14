/**
 * Turning a database refusal into a sentence.
 *
 * Deliberately free of `server-only` and of any Supabase import: it is a pure
 * mapping from an error code to a message key, which means it can be tested
 * without a database and read from either side of the boundary.
 */

/**
 * Two cases carry real meaning and are worth naming:
 *
 *   - `23505` — a slug, SKU or barcode already belongs to another record.
 *   - `23503` — `ON DELETE RESTRICT` refused the delete because an order, a
 *     product or a child category still points at this row. That refusal is
 *     the feature (FR-061): a deleted category would orphan the order history
 *     that proves what a customer bought. Staff are told to deactivate instead.
 *
 * Anything unrecognised becomes the generic message rather than a Postgres
 * string on a staff member's screen.
 */
export function describeWriteError(error: { code?: string; message?: string } | null): string {
  if (!error) return 'adminErrors.saveFailed';

  switch (error.code) {
    case '23505':
      return 'adminErrors.duplicate';
    case '23503':
      return 'adminErrors.inUseDeactivateInstead';
    case '42501':
      return 'adminErrors.notAuthorized';
    default:
      break;
  }

  const message = error.message ?? '';
  if (message.includes('category_cycle')) return 'adminErrors.categoryCycle';
  if (message.includes('category_too_deep')) return 'adminErrors.categoryTooDeep';
  if (message.includes('too_many_photos')) return 'adminErrors.tooManyPhotos';
  if (message.includes('not_authorized')) return 'adminErrors.notAuthorized';

  return 'adminErrors.saveFailed';
}
