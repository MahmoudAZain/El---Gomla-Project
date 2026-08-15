'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';

/**
 * The search box (T109).
 *
 * Typing navigates, after a pause. The pause matters more here than in most
 * places: on Egyptian mobile data a request per keystroke is both slow and
 * expensive for the shopper, and the free tier's request budget is finite.
 *
 * 400ms is chosen to sit above a fast typist's inter-key interval, so an
 * ordinary word produces one request rather than six.
 */
const DEBOUNCE_MS = 400;

/** Below three characters, trigram matching returns most of the catalog. */
const MIN_QUERY = 2;

export function SearchBox({ initialQuery = '' }: { initialQuery?: string }) {
  const t = useTranslations('search');
  const router = useRouter();

  const [value, setValue] = useState(initialQuery);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The box is also the search page's own control, so a query arriving from
  // elsewhere — a back navigation, a shared link — has to win over stale
  // local state.
  useEffect(() => {
    setValue(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function schedule(next: string) {
    setValue(next);

    if (timer.current) clearTimeout(timer.current);

    timer.current = setTimeout(() => {
      const trimmed = next.trim();
      if (trimmed.length >= MIN_QUERY) {
        router.push(`/search?q=${encodeURIComponent(trimmed)}`);
      }
    }, DEBOUNCE_MS);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (timer.current) clearTimeout(timer.current);

    const trimmed = value.trim();
    if (trimmed.length >= MIN_QUERY) {
      router.push(`/search?q=${encodeURIComponent(trimmed)}`);
    }
  }

  return (
    <form role="search" onSubmit={submit} className="flex w-full gap-2">
      <label htmlFor="site-search" className="sr-only">
        {t('label')}
      </label>

      <input
        id="site-search"
        type="search"
        value={value}
        onChange={(event) => schedule(event.target.value)}
        placeholder={t('placeholder')}
        // `search` rather than `text` so a phone keyboard offers a search key
        // instead of a newline.
        enterKeyHint="search"
        autoComplete="off"
        className="min-h-touch w-full rounded border border-rule bg-surface px-3 text-base text-ink placeholder:text-ink-3 focus:border-brand focus:outline-none"
      />

      <button
        type="submit"
        className="flex min-h-touch items-center rounded bg-brand px-4 text-sm font-semibold text-on-brand hover:bg-brand-hover"
      >
        {t('go')}
      </button>
    </form>
  );
}
