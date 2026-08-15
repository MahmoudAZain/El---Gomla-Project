import type { ReactNode } from 'react';

/**
 * A headline number (T096).
 *
 * These exist because a single value is not a chart. Revenue for a month is one
 * figure; drawing it as a one-bar bar chart wastes the space and makes the
 * reader work out a magnitude from a length when the number itself was right
 * there.
 *
 * The value uses the font's proportional figures rather than `tabular`. Tabular
 * digits give every glyph the width of a zero, which is right in a column of
 * numbers and looks conspicuously loose at display size.
 */
export function StatTile({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  /** `quiet` for context figures that should not compete with the headline. */
  tone?: 'default' | 'quiet' | 'warning';
}) {
  return (
    <div
      className={[
        'flex flex-col gap-1 rounded border p-4',
        tone === 'warning' ? 'border-danger bg-danger-soft' : 'border-rule bg-surface',
      ].join(' ')}
    >
      {/* Sentence case, no trailing colon — it is a caption, not a form label. */}
      <span className="text-sm text-ink-3">{label}</span>

      <span
        className={[
          'text-2xl font-semibold',
          tone === 'warning' ? 'text-danger' : tone === 'quiet' ? 'text-ink-2' : 'text-ink',
        ].join(' ')}
      >
        {value}
      </span>

      {hint && <span className="text-xs text-ink-3">{hint}</span>}
    </div>
  );
}

/**
 * The one number a view leads with.
 *
 * Exactly one per screen, in the same family as everything else — a display
 * face here would read as decoration on what is meant to be a plain statement
 * of fact.
 */
export function HeroFigure({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded border border-brand bg-brand-soft p-5">
      <span className="text-sm font-semibold text-brand">{label}</span>
      <span className="text-4xl font-bold text-brand sm:text-5xl">{value}</span>
      {hint && <span className="text-xs text-ink-2">{hint}</span>}
    </div>
  );
}
