'use client';

import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { presetRange, matchPreset, isValidDate, type DateRange, type RangeKey } from '@/lib/reports/range';

/**
 * The shared range control (FR-073, T095).
 *
 * The range lives in the URL, not in component state, for three reasons that
 * all matter more than the extra navigation: every report on the page reads the
 * same range from the same place, a range survives a reload, and "look at last
 * month" is a link the owner can send to the accountant.
 *
 * Presets are Cairo-local and computed in the browser from the viewer's clock.
 * That is correct here — the owner asking for "today" means their today.
 */
const PRESETS: Exclude<RangeKey, 'custom'>[] = ['today', 'week', 'month', 'lastMonth'];

export function DateRangePicker({ range }: { range: DateRange }) {
  const t = useTranslations('reports');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [draft, setDraft] = useState(range);
  const active = matchPreset(range);

  function go(next: DateRange) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('from', next.from);
    params.set('to', next.to);
    router.push(`${pathname}?${params.toString()}`);
  }

  const control =
    'min-h-touch rounded border border-rule bg-surface px-3 text-base text-ink focus:border-brand focus:outline-none';

  return (
    <div className="flex flex-col gap-3 rounded border border-rule bg-surface p-4">
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => go(presetRange(key))}
            aria-pressed={active === key}
            className={[
              'min-h-touch rounded px-3 text-sm font-semibold transition-colors',
              active === key
                ? 'bg-brand text-on-brand'
                : 'border border-rule text-ink-2 hover:border-brand hover:text-brand',
            ].join(' ')}
          >
            {t(`presets.${key}`)}
          </button>
        ))}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!isValidDate(draft.from) || !isValidDate(draft.to)) return;
          // A reversed range is swapped rather than refused: "December to
          // March" is a typo with an obvious intention.
          go(draft.from <= draft.to ? draft : { from: draft.to, to: draft.from });
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor="range-from" className="text-sm font-semibold text-ink">
            {t('from')}
          </label>
          <input
            id="range-from"
            type="date"
            dir="ltr"
            value={draft.from}
            onChange={(event) => setDraft({ ...draft, from: event.target.value })}
            className={control}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="range-to" className="text-sm font-semibold text-ink">
            {t('to')}
          </label>
          <input
            id="range-to"
            type="date"
            dir="ltr"
            value={draft.to}
            onChange={(event) => setDraft({ ...draft, to: event.target.value })}
            className={control}
          />
        </div>

        <button
          type="submit"
          className="min-h-touch rounded bg-brand px-4 text-sm font-semibold text-on-brand hover:bg-brand-hover"
        >
          {t('apply')}
        </button>
      </form>

      <p className="text-xs text-ink-3">{t('rangeIsCairo')}</p>
    </div>
  );
}
