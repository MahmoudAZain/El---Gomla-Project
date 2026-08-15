'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';

/**
 * The list view every admin screen uses.
 *
 * Sorting and filtering happen in the browser over a list the server already
 * sent. That is the right trade at this size — a few hundred products — and it
 * makes every column instantly sortable without a round trip on a connection
 * that may be 3G.
 *
 * Below `sm` the same rows render as cards. A table scrolled sideways on a
 * 360px phone is a table nobody reads, and the ops team will be doing this on
 * a phone.
 */

export interface Column<T> {
  key: string;
  header: string;
  /** Sorted and searched on this. Keep it a plain scalar. */
  value: (row: T) => string | number;
  /** Optional richer cell — badges, links, buttons. Falls back to `value`. */
  render?: (row: T) => ReactNode;
  sortable?: boolean;
  /** Hidden on phones, where only the first columns fit meaningfully. */
  hideOnMobile?: boolean;
}

export interface TableFilter {
  key: string;
  label: string;
  options: { value: string; label: string }[];
  match: (rowKey: string, value: string) => boolean;
}

export function DataTable<T>({
  rows,
  columns,
  getRowKey,
  searchLabel,
  filters = [],
  filterValueOf,
  emptyMessage,
  actions,
}: {
  rows: T[];
  columns: Column<T>[];
  getRowKey: (row: T) => string;
  searchLabel: string;
  filters?: TableFilter[];
  /** Value a given filter compares against, for one row. */
  filterValueOf?: (row: T, filterKey: string) => string;
  emptyMessage: string;
  /** Trailing cell: edit links, activate toggles. */
  actions?: (row: T) => ReactNode;
}) {
  const t = useTranslations('admin');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<{ key: string; asc: boolean } | null>(null);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();

    let result = rows.filter((row) => {
      if (needle) {
        const haystack = columns.map((c) => String(c.value(row)).toLowerCase()).join(' ');
        if (!haystack.includes(needle)) return false;
      }

      return Object.entries(selected).every(([key, value]) => {
        if (!value) return true;
        return filterValueOf ? filterValueOf(row, key) === value : true;
      });
    });

    if (sort) {
      const column = columns.find((c) => c.key === sort.key);
      if (column) {
        result = [...result].sort((a, b) => {
          const left = column.value(a);
          const right = column.value(b);
          const comparison =
            typeof left === 'number' && typeof right === 'number'
              ? left - right
              : // Arabic and English sort side by side in one list, so the
                // comparison has to be locale-aware rather than by code point.
                String(left).localeCompare(String(right), undefined, { numeric: true });
          return sort.asc ? comparison : -comparison;
        });
      }
    }

    return result;
  }, [rows, columns, query, selected, sort, filterValueOf]);

  function toggleSort(key: string) {
    setSort((current) =>
      current?.key === key ? { key, asc: !current.asc } : { key, asc: true },
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor="table-search" className="text-sm font-semibold text-ink">
            {searchLabel}
          </label>
          <input
            id="table-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="min-h-touch w-full rounded border border-rule bg-surface px-3 text-base text-ink focus:border-brand focus:outline-none"
          />
        </div>

        {filters.map((filter) => (
          <div key={filter.key} className="flex flex-col gap-1.5">
            <label htmlFor={`filter-${filter.key}`} className="text-sm font-semibold text-ink">
              {filter.label}
            </label>
            <select
              id={`filter-${filter.key}`}
              value={selected[filter.key] ?? ''}
              onChange={(event) =>
                setSelected((current) => ({ ...current, [filter.key]: event.target.value }))
              }
              className="min-h-touch rounded border border-rule bg-surface px-3 text-base text-ink focus:border-brand focus:outline-none"
            >
              <option value="">{t('allOption')}</option>
              {filter.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <p className="text-sm text-ink-3">{t('rowCount', { count: visible.length })}</p>

      {visible.length === 0 ? (
        <p className="rounded border border-rule bg-surface px-4 py-8 text-center text-ink-2">
          {emptyMessage}
        </p>
      ) : (
        <>
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-rule text-start">
                  {columns.map((column) => (
                    <th key={column.key} scope="col" className="px-3 py-2 text-start font-semibold text-ink-2">
                      {column.sortable === false ? (
                        column.header
                      ) : (
                        <button
                          type="button"
                          onClick={() => toggleSort(column.key)}
                          className="inline-flex items-center gap-1 hover:text-brand"
                          aria-label={`${column.header} — ${t('sort')}`}
                        >
                          {column.header}
                          <span aria-hidden="true" className="text-xs">
                            {sort?.key === column.key ? (sort.asc ? '▲' : '▼') : '↕'}
                          </span>
                        </button>
                      )}
                    </th>
                  ))}
                  {actions && (
                    <th scope="col" className="px-3 py-2 text-start font-semibold text-ink-2">
                      {t('actionsColumn')}
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={getRowKey(row)} className="border-b border-rule last:border-0">
                    {columns.map((column) => (
                      <td key={column.key} className="px-3 py-3 text-ink">
                        {column.render ? column.render(row) : String(column.value(row))}
                      </td>
                    ))}
                    {actions && <td className="px-3 py-3">{actions(row)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="flex flex-col gap-3 sm:hidden">
            {visible.map((row) => (
              <li
                key={getRowKey(row)}
                className="flex flex-col gap-2 rounded border border-rule bg-surface p-3"
              >
                {columns
                  .filter((column) => !column.hideOnMobile)
                  .map((column) => (
                    <div key={column.key} className="flex items-baseline justify-between gap-3">
                      <span className="text-xs font-semibold text-ink-3">{column.header}</span>
                      <span className="text-end text-sm text-ink">
                        {column.render ? column.render(row) : String(column.value(row))}
                      </span>
                    </div>
                  ))}
                {actions && <div className="flex flex-wrap gap-2 pt-1">{actions(row)}</div>}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
