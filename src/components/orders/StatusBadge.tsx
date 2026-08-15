import { statusTone } from '@/lib/order-status';
import type { OrderStatus } from '@/types/database';

/**
 * A status badge.
 *
 * Colour carries the meaning but never alone: the label is always the status in
 * words, so the badge works for a colour-blind picker under warehouse lighting
 * and for anyone reading a printed queue.
 */
const TONES = {
  neutral: 'bg-surface-2 text-ink-2',
  active: 'bg-brand-soft text-brand',
  done: 'bg-surface-2 text-ink',
  stopped: 'bg-danger-soft text-danger',
} as const;

export function StatusBadge({ status, label }: { status: OrderStatus; label: string }) {
  return (
    <span
      className={`rounded px-2 py-1 text-xs font-semibold ${TONES[statusTone(status)]}`}
    >
      {label}
    </span>
  );
}
