/**
 * URL slugs.
 *
 * Slugs are built from the **English** name, never the Arabic one: a
 * percent-encoded Arabic path is unreadable in a shared link and unusable in a
 * WhatsApp message, which is how most of this catalog will travel.
 */

/** `"Fresh Milk 1L"` → `"fresh-milk-1l"`. Returns `null` when nothing survives. */
export function slugify(input: string): string | null {
  const slug = input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug.length > 0 ? slug : null;
}

/**
 * Appends a short suffix so a second "Milk" does not collide with the first.
 * The unique index remains the guarantee; this only avoids meeting it.
 */
export function uniquifySlug(slug: string): string {
  return `${slug}-${Math.random().toString(36).slice(2, 6)}`;
}
