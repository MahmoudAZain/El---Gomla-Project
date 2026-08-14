import { describe, it, expect } from 'vitest';
import {
  STAFF_TRANSITIONS,
  ORDER_STATUSES,
  OPEN_STATUSES,
  isTerminal,
  customerMayCancel,
  statusTone,
} from '@/lib/order-status';
import type { OrderStatus } from '@/types/database';

/**
 * The transition table that decides which buttons a staff screen offers.
 *
 * It is a copy of the table inside `set_order_status()`, and the copy is only
 * safe in one direction: it may offer *fewer* transitions than the database
 * permits, never more. A button the database refuses is an annoyance; a screen
 * that lets staff do something the state machine forbids would be a lie about
 * what happened to an order.
 *
 * `supabase/tests/lifecycle.test.sql` asserts the same table against the real
 * function. These cases guard the shape the UI depends on.
 */

describe('the staff transition table', () => {
  it('covers every status with no gaps', () => {
    for (const status of ORDER_STATUSES) {
      expect(STAFF_TRANSITIONS[status]).toBeDefined();
    }
    expect(Object.keys(STAFF_TRANSITIONS).sort()).toEqual([...ORDER_STATUSES].sort());
  });

  it('never offers a transition to the state already held', () => {
    for (const status of ORDER_STATUSES) {
      expect(STAFF_TRANSITIONS[status]).not.toContain(status);
    }
  });

  it('only ever names real statuses', () => {
    for (const targets of Object.values(STAFF_TRANSITIONS)) {
      for (const target of targets) {
        expect(ORDER_STATUSES).toContain(target);
      }
    }
  });

  it('treats cancelled and returned as terminal', () => {
    expect(isTerminal('cancelled')).toBe(true);
    expect(isTerminal('returned')).toBe(true);
  });

  it('lets a delivered order be returned but nothing else', () => {
    expect(STAFF_TRANSITIONS.delivered).toEqual(['returned']);
  });

  it('allows cancellation at every stage before the driver leaves', () => {
    for (const status of ['submitted', 'confirmed', 'preparing'] as OrderStatus[]) {
      expect(STAFF_TRANSITIONS[status]).toContain('cancelled');
    }
  });

  it('stops offering cancellation once the order is out for delivery', () => {
    expect(STAFF_TRANSITIONS.out_for_delivery).toEqual(['delivered']);
  });

  it('reaches delivered from submitted without revisiting a state', () => {
    const seen = new Set<OrderStatus>();
    let current: OrderStatus = 'submitted';

    while (current !== 'delivered') {
      expect(seen.has(current)).toBe(false);
      seen.add(current);

      const next = STAFF_TRANSITIONS[current].find((s) => s !== 'cancelled');
      expect(next).toBeDefined();
      current = next as OrderStatus;
    }

    expect(current).toBe('delivered');
  });
});

describe('the queue default', () => {
  it('shows the states that still need someone', () => {
    expect(OPEN_STATUSES).toEqual(['submitted', 'confirmed', 'preparing', 'out_for_delivery']);
  });

  it('excludes every terminal state', () => {
    for (const status of OPEN_STATUSES) {
      expect(isTerminal(status)).toBe(false);
    }
  });
});

describe('the customer cancellation window (FR-048)', () => {
  it('is open only while the order is submitted', () => {
    expect(customerMayCancel('submitted')).toBe(true);

    for (const status of ORDER_STATUSES.filter((s) => s !== 'submitted')) {
      expect(customerMayCancel(status)).toBe(false);
    }
  });
});

describe('status badges', () => {
  it('gives every status a tone', () => {
    for (const status of ORDER_STATUSES) {
      expect(['neutral', 'active', 'done', 'stopped']).toContain(statusTone(status));
    }
  });

  it('marks the two states that should catch the eye', () => {
    expect(statusTone('cancelled')).toBe('stopped');
    expect(statusTone('returned')).toBe('stopped');
  });
});
