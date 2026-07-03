// Tests for REQ-202: money input parsing and centavos formatting.
//
// Spec:    openspec/changes/mvp-financiero-local-first/spec.md §REQ-202
//          (Scenario: "Formateo de input numérico").
// Design:  openspec/changes/mvp-financiero-local-first/design.md §1
//          (decimal.js, INTEGER cents) and §8 (precision policy).
// Tasks:   T-202 (TransaccionForm input parser), T-204 (precision helper).
// Test #:  slice 3 / frontend / REQ-202 (4 tests).
//
// RED PHASE: this file imports `parseAmount`, `toCentavos` and
// `formatCentavos` from `../money`, but the existing `money.ts` module
// only exports `money`, `zero`, `Decimal`, and `Money`. `pnpm test`
// MUST fail at the import-resolution step. The IMPL phase will extend
// `src/domain/precision/money.ts` (existing file — must NOT be deleted,
// per the user's hard rule #3) with three new exports pinned below.
//
// Pin of signatures for the IMPL phase (from the user's prompt — binding):
//
//   export function parseAmount(input: string): number
//   export function toCentavos(monto: number): number
//   export function formatCentavos(centavos: number): string
//
// Locale: Spanish neutral (es-ES / es-419 family). Thousand separator = "."
// and decimal separator = ",". This matches the locked product decision
// in spec.md §REQ-601.

import { describe, it, expect } from 'vitest'
import { parseAmount, toCentavos, formatCentavos } from '../money'

describe('REQ-202: parser y formateador de montos (input de captura)', () => {
  describe('parseAmount — string con separadores localized', () => {
    // REQ-202 / Scenario: "Formateo de input numérico".
    // Given:  the user types "1.500.000" (Spanish thousand-separator style).
    // When:   parseAmount interprets it.
    // Then:   the result is 1500000 as a Number — the dots are stripped as
    //         grouping, NOT treated as decimal points.
    it('req_202_parse_amount_handles_dot_separator', () => {
      expect(parseAmount('1.500.000')).toBe(1_500_000)
      // No thousands separator:
      expect(parseAmount('500000')).toBe(500_000)
      // Multiple grouping:
      expect(parseAmount('1.234.567.890')).toBe(1_234_567_890)
    })

    // REQ-202 / Inverse direction of the locale formatter.
    // Given:  the user types "1500000,50" (comma as decimal separator).
    // When:   parseAmount interprets it.
    // Then:   the result is 1500000.5 — the comma is converted to "." for
    //         JS Number semantics, but we must NOT confuse it with grouping.
    it('req_202_parse_amount_handles_comma_decimal', () => {
      expect(parseAmount('1500000,50')).toBe(1_500_000.5)
      expect(parseAmount('0,99')).toBe(0.99)
    })
  })

  describe('toCentavos — frontera memoria → DB', () => {
    // REQ-202 / Scenario: "el sistema interpreta el valor como 1500000
    //                    y lo persiste multiplicado por 100".
    //
    // Given:  the form has a parsed amount of 1500000.5 (one and a half
    //         million pesos + 50 cents).
    // When:   the form calls toCentavos before persisting.
    // Then:   the result is 150000050 — an INTEGER (no fractional cents
    //         leaking into SQLite). This is the EXACT pin that REQ-202
    //         imposes: multiply by 100, never store a float.
    it('req_202_to_centavos_multiplies_by_100', () => {
      const result = toCentavos(1_500_000.5)
      expect(result).toBe(150_000_050)
      // Integer-ness is part of the contract (SQLite column is INTEGER).
      expect(Number.isInteger(result)).toBe(true)
    })

    // Defensive case: parseAmount + toCentavos compose correctly.
    // Given:  user types "1.500.000,50".
    // When:   parseAmount → toCentavos runs in sequence.
    // Then:   the final integer is 150000050.
    it('req_202_parse_then_to_centavos_round_trip', () => {
      const parsed = parseAmount('1.500.000,50')
      const centavos = toCentavos(parsed)
      expect(centavos).toBe(150_000_050)
    })
  })

  describe('formatCentavos — frontera DB → UI (Spanish locale)', () => {
    // REQ-202 + REQ-601 (Spanish UI).
    // Given:  a stored integer 150000050 (the same value the previous
    //         test produced).
    // When:   the UI formats it for display.
    // Then:   the string is "1.500.000,50" — dots as thousand grouping,
    //         comma as decimal separator. This is the canonical Spanish
    //         neutral format locked in REQ-601.
    it('req_202_format_centavos_uses_thousands_separator', () => {
      expect(formatCentavos(150_000_050)).toBe('1.500.000,50')
      // No fractional cents:
      expect(formatCentavos(100_000_000)).toBe('1.000.000')
      // Larger amounts:
      expect(formatCentavos(1_234_567_890)).toBe('12.345.678,90')
    })
  })
})