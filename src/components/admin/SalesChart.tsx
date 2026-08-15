'use client';

import { useId, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { formatMoney, formatNumber } from '@/lib/money';
import type { Locale } from '@/i18n/routing';

/**
 * Revenue over time (T096).
 *
 * **One series, so one hue and no legend.** The heading says what is plotted;
 * a legend box with a single swatch would only restate it. The job here is
 * trend over time, which is a line — and with a single measure there is no
 * temptation toward the second y-axis that ruins most business charts.
 *
 * Deliberately hand-drawn SVG rather than a charting library. The Workers
 * bundle is the constraint that matters (Principle IV): a charting dependency
 * costs more transferred bytes than this whole console, for one line.
 *
 * Direction: the x-axis runs left-to-right in both languages. Time is not a
 * text run, and mirroring a time axis in Arabic makes a rising trend look like
 * a falling one to anyone who has ever seen a chart. The *labels* localize; the
 * geometry does not.
 */

export interface ChartPoint {
  day: string;
  revenue: number;
}

const WIDTH = 720;
const HEIGHT = 240;
const PAD = { top: 16, right: 16, bottom: 28, start: 64 };

/** Rounds an axis maximum up to something a person would say out loud. */
function niceCeiling(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 2.5, 5, 10]) {
    const candidate = step * magnitude;
    if (candidate >= value) return candidate;
  }
  return 10 * magnitude;
}

export function SalesChart({
  points,
  locale,
  title,
}: {
  points: ChartPoint[];
  locale: Locale;
  title: string;
}) {
  const t = useTranslations('reports');
  const gradientId = useId();
  const [hover, setHover] = useState<number | null>(null);

  const { path, area, coords, max, ticks } = useMemo(() => {
    const values = points.map((p) => p.revenue);
    const ceiling = niceCeiling(Math.max(...values, 1));

    const plotWidth = WIDTH - PAD.start - PAD.right;
    const plotHeight = HEIGHT - PAD.top - PAD.bottom;

    const x = (index: number) =>
      points.length === 1
        ? PAD.start + plotWidth / 2
        : PAD.start + (index / (points.length - 1)) * plotWidth;

    const y = (value: number) => PAD.top + plotHeight - (value / ceiling) * plotHeight;

    const pointCoords = points.map((point, index) => ({
      x: x(index),
      y: y(point.revenue),
      ...point,
    }));

    const line = pointCoords
      .map((c, index) => `${index === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
      .join(' ');

    const filled =
      pointCoords.length > 0
        ? `${line} L ${pointCoords[pointCoords.length - 1]!.x.toFixed(1)} ${(HEIGHT - PAD.bottom).toFixed(1)}` +
          ` L ${pointCoords[0]!.x.toFixed(1)} ${(HEIGHT - PAD.bottom).toFixed(1)} Z`
        : '';

    return {
      path: line,
      area: filled,
      coords: pointCoords,
      max: ceiling,
      // Four gridlines including the baseline: enough to read a value off,
      // few enough to stay recessive.
      ticks: [0, 0.25, 0.5, 0.75, 1].map((fraction) => ({
        value: ceiling * fraction,
        y: PAD.top + plotHeight - fraction * plotHeight,
      })),
    };
  }, [points]);

  if (points.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        <p className="rounded border border-rule bg-surface px-4 py-8 text-center text-ink-2">
          {t('noSalesInRange')}
        </p>
      </div>
    );
  }

  const peak = coords.reduce((best, c) => (c.revenue > best.revenue ? c : best), coords[0]!);
  const last = coords[coords.length - 1]!;
  const active = hover !== null ? coords[hover] : null;

  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="text-sm font-semibold text-ink">{title}</figcaption>

      <div className="relative overflow-x-auto rounded border border-rule bg-surface p-2">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="h-56 w-full min-w-[480px]"
          role="img"
          aria-label={title}
          // The plot is geometry, not prose: left-to-right in both languages so
          // a rising trend rises whichever way the page reads. SVG has no `dir`
          // attribute in its own namespace, so the direction is set in CSS.
          style={{ direction: 'ltr' }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              {/* A wash, not a block — the line carries the value, the fill only
                  gives it a body to sit on. */}
              <stop offset="0%" stopColor="var(--color-brand)" stopOpacity="0.16" />
              <stop offset="100%" stopColor="var(--color-brand)" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Gridlines: hairline, solid, one step off the surface. Never dashed. */}
          {ticks.map((tick) => (
            <g key={tick.value}>
              <line
                x1={PAD.start}
                x2={WIDTH - PAD.right}
                y1={tick.y}
                y2={tick.y}
                stroke="var(--color-rule)"
                strokeWidth="1"
              />
              <text
                x={PAD.start - 8}
                y={tick.y + 4}
                textAnchor="end"
                className="fill-[var(--color-ink-3)] text-[11px]"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {formatNumber(Math.round(tick.value / 100), locale)}
              </text>
            </g>
          ))}

          <path d={area} fill={`url(#${gradientId})`} />

          <path
            d={path}
            fill="none"
            stroke="var(--color-brand)"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* Crosshair for the hovered day. */}
          {active && (
            <line
              x1={active.x}
              x2={active.x}
              y1={PAD.top}
              y2={HEIGHT - PAD.bottom}
              stroke="var(--color-rule-strong)"
              strokeWidth="1"
            />
          )}

          {/* End marker, with a surface ring so it stays legible over the line. */}
          <circle
            cx={last.x}
            cy={last.y}
            r="5"
            fill="var(--color-brand)"
            stroke="var(--color-surface)"
            strokeWidth="2"
          />

          {active && active !== last && (
            <circle
              cx={active.x}
              cy={active.y}
              r="5"
              fill="var(--color-brand)"
              stroke="var(--color-surface)"
              strokeWidth="2"
            />
          )}

          {/*
            Two labels, not one per point. The peak is the thing a reader looks
            for, and the last value is where the story currently stands; a
            number on every day is noise that goes unread.
          */}
          {coords.length > 1 && (
            <text
              x={peak.x}
              y={peak.y - 10}
              textAnchor="middle"
              className="fill-[var(--color-ink-2)] text-[11px] font-semibold"
            >
              {formatMoney(peak.revenue, locale)}
            </text>
          )}

          {/* Invisible hit bands, wider than the marks, so hovering is easy. */}
          {coords.map((c, index) => (
            <rect
              key={c.day}
              x={c.x - (WIDTH - PAD.start - PAD.right) / Math.max(coords.length, 1) / 2}
              y={PAD.top}
              width={(WIDTH - PAD.start - PAD.right) / Math.max(coords.length, 1)}
              height={HEIGHT - PAD.top - PAD.bottom}
              fill="transparent"
              onMouseEnter={() => setHover(index)}
              onMouseLeave={() => setHover(null)}
            />
          ))}

          <text
            x={PAD.start}
            y={HEIGHT - 8}
            className="fill-[var(--color-ink-3)] text-[11px]"
          >
            {coords[0]!.day}
          </text>
          {coords.length > 1 && (
            <text
              x={WIDTH - PAD.right}
              y={HEIGHT - 8}
              textAnchor="end"
              className="fill-[var(--color-ink-3)] text-[11px]"
            >
              {last.day}
            </text>
          )}
        </svg>

        {active && (
          <div
            role="status"
            className="pointer-events-none absolute top-2 rounded border border-rule bg-surface px-3 py-2 text-xs shadow-sm"
            style={{ insetInlineStart: '50%', transform: 'translateX(-50%)' }}
          >
            <span className="font-semibold text-ink" dir="ltr">
              {active.day}
            </span>
            <span className="ms-2 text-ink-2">{formatMoney(active.revenue, locale)}</span>
          </div>
        )}
      </div>

      <p className="text-xs text-ink-3">{t('axisInPounds', { max: formatMoney(max, locale) })}</p>

      {/*
        The same numbers as a table, for a screen reader and for anyone who
        would rather read than squint. Visually hidden, never gated behind a
        toggle nobody finds.
      */}
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">{t('day')}</th>
            <th scope="col">{t('revenue')}</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.day}>
              <th scope="row">{point.day}</th>
              <td>{formatMoney(point.revenue, locale)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
