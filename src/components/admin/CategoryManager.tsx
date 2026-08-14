'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  saveCategory,
  setCategoryActive,
  reorderCategories,
  deleteCategory,
} from '@/lib/actions/admin/categories';
import { BilingualField } from './BilingualField';
import { Button } from '@/components/ui/Button';
import { Select, FormError } from '@/components/ui/Field';
import type { AdminCategoryRow } from '@/lib/queries/admin';

/**
 * Category management (FR-053).
 *
 * The tree is shown as a flat list with indentation rather than collapsing
 * branches. At three levels and a few dozen categories, seeing all of it at
 * once is more useful than tidiness — the question staff come here with is
 * "where does this product belong", and that is answered by looking.
 *
 * Reordering moves one row at a time and sends the whole resulting order, so
 * two people rearranging at once produce one order rather than an interleaving.
 */

interface Node extends AdminCategoryRow {
  depth: number;
}

function flatten(rows: AdminCategoryRow[]): Node[] {
  const byParent = new Map<string | null, AdminCategoryRow[]>();
  for (const row of rows) {
    const key = row.parent_id;
    byParent.set(key, [...(byParent.get(key) ?? []), row]);
  }

  const out: Node[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const row of byParent.get(parent) ?? []) {
      out.push({ ...row, depth });
      walk(row.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

export function CategoryManager({
  categories,
  locale,
}: {
  categories: AdminCategoryRow[];
  locale: string;
}) {
  const t = useTranslations('admin');
  const tError = useTranslations();
  const router = useRouter();

  const [editing, setEditing] = useState<AdminCategoryRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const nodes = flatten(categories);
  const label = (row: { name_ar: string; name_en: string }) =>
    locale === 'ar' ? row.name_ar : row.name_en;

  async function onSubmit(formData: FormData) {
    setBusy(true);
    setError(null);

    const result = await saveCategory(formData);
    if (result.ok) {
      setEditing(null);
      router.refresh();
    } else {
      setError(result.error);
    }
    setBusy(false);
  }

  async function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    setError(null);
    const result = await action();
    if (!result.ok) setError(result.error ?? 'adminErrors.saveFailed');
    setBusy(false);
    router.refresh();
  }

  function moveWithinSiblings(node: Node, direction: -1 | 1) {
    const siblings = categories
      .filter((row) => row.parent_id === node.parent_id)
      .sort((a, b) => a.sort_order - b.sort_order);

    const index = siblings.findIndex((row) => row.id === node.id);
    const target = index + direction;
    if (target < 0 || target >= siblings.length) return;

    const reordered = [...siblings];
    const moved = reordered[index];
    if (!moved) return;
    reordered.splice(index, 1);
    reordered.splice(target, 0, moved);

    void run(() => reorderCategories(reordered.map((row) => row.id)));
  }

  return (
    <div className="flex flex-col gap-6">
      {error && <FormError>{tError(error)}</FormError>}

      <form
        action={onSubmit}
        key={editing?.id ?? 'new'}
        className="flex flex-col gap-4 rounded border border-rule bg-surface p-4"
      >
        <h2 className="text-sm font-semibold text-ink">
          {editing ? t('editCategory') : t('newCategory')}
        </h2>

        {editing && <input type="hidden" name="id" value={editing.id} />}

        <BilingualField
          name="name"
          label={t('categoryName')}
          defaultAr={editing?.name_ar}
          defaultEn={editing?.name_en}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            id="parent_id"
            name="parent_id"
            label={t('parentCategory')}
            hint={t('parentCategoryHint')}
            defaultValue={editing?.parent_id ?? ''}
          >
            <option value="">{t('topLevel')}</option>
            {nodes
              // A category cannot be its own parent. Deeper cycles and the
              // three-level cap are refused by the database trigger, which is
              // the guarantee; this only keeps the obvious case off the list.
              .filter((node) => node.id !== editing?.id)
              .map((node) => (
                <option key={node.id} value={node.id}>
                  {'— '.repeat(node.depth)}
                  {label(node)}
                </option>
              ))}
          </Select>

          <label className="flex min-h-touch items-center gap-2 self-end text-sm font-semibold text-ink">
            <input
              type="checkbox"
              name="is_active"
              defaultChecked={editing?.is_active ?? true}
              className="size-5 accent-brand"
            />
            {t('visibleInShop')}
          </label>
        </div>

        <input type="hidden" name="sort_order" value={editing?.sort_order ?? 0} />

        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={busy}>
            {busy ? t('saving') : t('save')}
          </Button>
          {editing && (
            <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
              {t('cancel')}
            </Button>
          )}
        </div>
      </form>

      <ul className="flex flex-col gap-2">
        {nodes.map((node) => (
          <li
            key={node.id}
            style={{ marginInlineStart: `${node.depth * 1.5}rem` }}
            className={[
              'flex flex-col gap-2 rounded border p-3 sm:flex-row sm:items-center sm:justify-between',
              node.is_active ? 'border-rule bg-surface' : 'border-dashed border-rule-strong bg-surface-2',
            ].join(' ')}
          >
            <div className="flex flex-col">
              <span className={node.is_active ? 'font-semibold text-ink' : 'font-semibold text-ink-3'}>
                {label(node)}
              </span>
              <span className="text-xs text-ink-3">
                {t('productCount', { count: node.product_count })}
                {!node.is_active && ` · ${t('hidden')}`}
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="ghost" onClick={() => moveWithinSiblings(node, -1)} disabled={busy}>
                ↑
              </Button>
              <Button type="button" variant="ghost" onClick={() => moveWithinSiblings(node, 1)} disabled={busy}>
                ↓
              </Button>
              <Button type="button" variant="secondary" onClick={() => setEditing(node)}>
                {t('edit')}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => run(() => setCategoryActive(node.id, !node.is_active))}
              >
                {node.is_active ? t('deactivate') : t('activate')}
              </Button>
              {/*
                Offered, but refused by the database the moment anything points
                at it. Staff are told to deactivate instead, which is what the
                business almost always means (FR-061).
              */}
              <Button
                type="button"
                variant="danger"
                disabled={busy}
                onClick={() => run(() => deleteCategory(node.id))}
              >
                {t('delete')}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
