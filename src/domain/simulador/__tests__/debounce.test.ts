// Tests for REQ-402: debounce + flush-on-close utility.
//
// Spec:    openspec/changes/mvp-financiero-local-first/spec.md §REQ-402
// Design:  `openspec/changes/mvp-financiero-local-first/design.md` §10.2
//          (debounce de escritura), §10.3 (flush-on-close).
// Tasks:   T-402 (debounce), T-403 (flush on close).
// Test #:  slice 5 / frontend / REQ-402 (5 tests).
//
// RED PHASE: this file imports from
// `src/domain/simulador/debounce`, which does NOT exist yet.
// `pnpm test` MUST fail at the import-resolution step — that's the
// expected RED state. The IMPL phase will introduce the module
// exporting `DebouncedCallback` (interface) and
// `createDebouncedCallback` (factory).
//
// Pin of signatures for the IMPL phase (from the user's prompt — binding):
//
//   export interface DebouncedCallback<T> {
//     call(value: T): void
//     flush(): void
//     cancel(): void
//   }
//
//   export function createDebouncedCallback<T>(
//     fn: (value: T) => void | Promise<void>,
//     delayMs: number,
//   ): DebouncedCallback<T>
//
// Behavioral contract (from REQ-402 + design §10.2/§10.3):
//   * `call(v)` schedules `fn(v)` after `delayMs`. Calling `call`
//     again before the delay elapses RESETS the timer (coalescing).
//   * The fn is invoked exactly once per quiescent period, with the
//     LAST value passed to `call`.
//   * `flush()` invokes the pending fn synchronously if a call is
//     scheduled. No-op if there's nothing pending.
//   * `cancel()` drops the pending fn. After `cancel`, the delay can
//     elapse without invoking fn.
//   * `fn` may be async — `createDebouncedCallback` does not await
//     the result; the caller decides how to surface errors (TBD).
//
// These tests use `vi.useFakeTimers()` + `vi.advanceTimersByTime()`
// to control time deterministically without real waits.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createDebouncedCallback } from '../debounce'

// ---------------------------------------------------------------------------
// Test setup: every test gets a fresh fake-timer world.
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

// ---------------------------------------------------------------------------
// Tests — one per scenario in the user's prompt.
// ---------------------------------------------------------------------------

describe('REQ-402: createDebouncedCallback', () => {
  it('req_402_debounce_delays_call_by_delay', () => {
    const fn = vi.fn()
    const cb = createDebouncedCallback<number>(fn, 300)

    cb.call(42)

    // Less than the delay: fn has NOT been invoked yet.
    vi.advanceTimersByTime(299)
    expect(fn).not.toHaveBeenCalled()
  })

  it('req_402_debounce_invokes_after_delay', () => {
    const fn = vi.fn()
    const cb = createDebouncedCallback<number>(fn, 300)

    cb.call(42)
    vi.advanceTimersByTime(300)

    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith(42)
  })

  it('req_402_debounce_coalesces_multiple_calls', () => {
    const fn = vi.fn()
    const cb = createDebouncedCallback<string>(fn, 300)

    cb.call('a')
    vi.advanceTimersByTime(100)
    cb.call('b')
    vi.advanceTimersByTime(100)
    cb.call('c')

    // Total elapsed since first call: 200ms (still under 300ms from
    // the LAST call at 200ms).
    vi.advanceTimersByTime(299)
    expect(fn).not.toHaveBeenCalled()

    // 300ms after the LAST call: fn fires once with 'c'.
    vi.advanceTimersByTime(1)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('c')
  })

  it('req_402_debounce_flush_invokes_immediately', () => {
    const fn = vi.fn()
    const cb = createDebouncedCallback<number>(fn, 300)

    cb.call(7)
    // 50ms in (well under 300ms): fn hasn't fired.
    vi.advanceTimersByTime(50)
    expect(fn).not.toHaveBeenCalled()

    // flush() invokes fn synchronously.
    cb.flush()
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith(7)

    // After flush, advancing the timers must NOT invoke fn again
    // (the pending timer is cleared by flush).
    vi.advanceTimersByTime(500)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('req_402_debounce_cancel_prevents_pending_call', () => {
    const fn = vi.fn()
    const cb = createDebouncedCallback<number>(fn, 300)

    cb.call(99)
    vi.advanceTimersByTime(100)
    expect(fn).not.toHaveBeenCalled()

    cb.cancel()

    // Even after the full delay elapses, fn is NOT invoked.
    vi.advanceTimersByTime(500)
    expect(fn).not.toHaveBeenCalled()
  })
})