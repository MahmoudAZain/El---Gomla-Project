import { getFormatter, getTranslations } from 'next-intl/server';
import type { OrderStatus, UserRole } from '@/types/database';

export interface HistoryEntry {
  id: string;
  from_status: OrderStatus | null;
  to_status: OrderStatus;
  actor_role: UserRole | null;
  note: string | null;
  created_at: string;
}

/**
 * The order's history (FR-046, FR-047).
 *
 * Shown to the customer and to staff from the same component, deliberately.
 * When a driver and a customer disagree about what was promised, the log is the
 * only evidence there is — and evidence one side cannot see is not evidence, it
 * is an assertion.
 *
 * The border sits on the inline-start edge, so the spine of the timeline is on
 * the right in Arabic and the left in English without a second stylesheet.
 */
export async function StatusTimeline({
  history,
  showActor = false,
}: {
  history: HistoryEntry[];
  /** Staff see who moved the order. Customers see only that it moved. */
  showActor?: boolean;
}) {
  const t = await getTranslations('orders');
  const tAdmin = await getTranslations('admin');
  const format = await getFormatter();

  const ordered = [...history].sort((a, b) => a.created_at.localeCompare(b.created_at));

  if (ordered.length === 0) {
    return <p className="text-sm text-ink-3">{t('noHistory')}</p>;
  }

  return (
    <ol className="flex flex-col gap-3 border-s-2 border-rule ps-4">
      {ordered.map((entry) => (
        <li key={entry.id} className="flex flex-col gap-0.5">
          <span className="font-semibold text-ink">{t(`statuses.${entry.to_status}`)}</span>

          <span className="text-xs text-ink-3">
            {format.dateTime(new Date(entry.created_at), 'full')}
            {showActor && entry.actor_role && (
              <>
                {' · '}
                {entry.actor_role === 'customer'
                  ? t('byCustomer')
                  : tAdmin(entry.actor_role === 'admin' ? 'roleAdmin' : 'roleStaff')}
              </>
            )}
          </span>

          {entry.note && <span className="text-sm text-ink-2">{entry.note}</span>}
        </li>
      ))}
    </ol>
  );
}
