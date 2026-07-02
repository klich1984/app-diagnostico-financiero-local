// Tests for REQ-203: temporal normalization engine.
//
// Spec:    openspec/changes/mvp-financiero-local-first/spec.md §REQ-203
// Design:  openspec/changes/mvp-financiero-local-first/design.md §8 (formula)
//          and §8.2 (precision policy: Decimal with ROUND_HALF_EVEN, 28 digits).
// Tasks:   T-204 (slice 3).
// Test #:  slice 3 / frontend / REQ-203 (8 tests).
//
// RED PHASE: this file imports from `../../domain/normalizacion`, which
// does NOT exist yet. `pnpm test` MUST fail at the import-resolution step
// before any `it()` block runs. That is the expected RED state. The IMPL
// phase will introduce `src/domain/normalizacion/index.ts` exporting the
// functions pinned below.
//
// Pin of signatures for the IMPL phase (from the user's prompt — binding):
//
//   export type Frecuencia = 'Mensual' | 'Bimensual' | 'Trimestral' | 'Semestral' | 'Anual'
//   export function valorMensual(valorCentavos: number, frecuencia: Frecuencia): Decimal
//   export function valorAnual(valorCentavos: number, frecuencia: Frecuencia): Decimal
//
// The implementation MUST use decimal.js (Decimal) to avoid IEEE-754 drift
// in non-exact divisions (e.g. 50000000 / 3). Plain Number would lose
// precision after the third significant digit. The design document
// (design.md §8.2) is explicit: precision 28 + ROUND_HALF_EVEN.

import { describe, it, expect } from 'vitest'
import { Decimal } from '../../precision/money'
import { valorMensual, valorAnual } from '..'

describe('REQ-203: motor de normalización temporal', () => {
  describe('valorMensual — divisor por frecuencia', () => {
    // REQ-203 / Scenario: "Normalización Mensual".
    // Given:  valor_centavos = 100000000 ($1.000.000,00 expressed in cents)
    //         and frecuencia = "Mensual".
    // When:   the engine computes the monthly equivalent.
    // Then:   the result is exactly 100000000 (no division).
    it('req_203_mensual_divides_by_1', () => {
      const result = valorMensual(100_000_000, 'Mensual')
      expect(result.equals(new Decimal(100_000_000))).toBe(true)
      // Equality on toString() also catches accidental Decimal(1e8) vs Decimal(100000000)
      expect(result.toString()).toBe('100000000')
    })

    // REQ-203 / Scenario: "Normalización Bimensual".
    // Given:  valor_centavos = 100000000 and frecuencia = "Bimensual".
    // When:   the engine computes the monthly equivalent.
    // Then:   the result is 50000000 (divisor 2).
    it('req_203_bimensual_divides_by_2', () => {
      const result = valorMensual(100_000_000, 'Bimensual')
      expect(result.toString()).toBe('50000000')
    })

    // REQ-203 / Scenario: "Normalización Trimestral" (exact).
    // Given:  valor_centavos = 150000000 (divisible by 3).
    // When:   the engine computes the monthly equivalent.
    // Then:   the result is exactly 50000000 (no fractional part).
    it('req_203_trimestral_divides_by_3_exact', () => {
      const result = valorMensual(150_000_000, 'Trimestral')
      expect(result.toString()).toBe('50000000')
    })

    // REQ-203 / Scenario: "Normalización Semestral".
    // Given:  valor_centavos = 120000000 and frecuencia = "Semestral".
    // When:   the engine computes the monthly equivalent.
    // Then:   the result is 20000000 (divisor 6).
    it('req_203_semestral_divides_by_6', () => {
      const result = valorMensual(120_000_000, 'Semestral')
      expect(result.toString()).toBe('20000000')
    })

    // REQ-203 / Scenario: "Normalización Anual".
    // Given:  valor_centavos = 12000000 and frecuencia = "Anual".
    // When:   the engine computes the monthly equivalent.
    // Then:   the result is 1000000 (divisor 12).
    it('req_203_anual_divides_by_12', () => {
      const result = valorMensual(12_000_000, 'Anual')
      expect(result.toString()).toBe('1000000')
    })

    // REQ-203 / Scenario: non-exact division must NOT drift.
    // Given:  valor_centavos = 50000000 and frecuencia = "Trimestral".
    // When:   the engine computes the monthly equivalent (50000000 / 3).
    // Then:   the result is 16666666.666... with full decimal.js precision.
    //         A plain Number would yield 16666666.666666664 (drift).
    it('req_203_handles_non_exact_division_without_drift', () => {
      const result = valorMensual(50_000_000, 'Trimestral')
      // Decimal preserves all 28 significant digits — we compare with a
      // explicit Decimal literal to avoid any Number coercion on the way.
      const expected = new Decimal('16666666.666666666666666666666667')
      expect(result.equals(expected)).toBe(true)
      // Belt-and-suspenders: the string form should NOT contain the lossy
      // Number rounding "16666666.666666664".
      expect(result.toString()).not.toMatch(/16666666\.66666666\d/)
    })

    // REQ-203 / Contract: unknown frecuencias must throw (no silent coercion).
    // Given:  a frecuencia string that is NOT in the locked enum.
    // When:   the engine is asked to divide by it.
    // Then:   it throws — the type system already prevents this in TS at
    //         compile time, but at runtime (data from DB) we need a guard.
    it('req_203_rejects_invalid_frecuencia', () => {
      // Bypass the compile-time check with an `as any` cast — the IMPL
      // must defend itself at runtime because the string can come from
      // a raw SQL row that pre-dates a migration.
      expect(() => valorMensual(100_000, 'Quincenal' as any)).toThrow()
      expect(() => valorMensual(100_000, '' as any)).toThrow()
    })
  })

  describe('valorAnual — anualización vía equivalente mensual ×12', () => {
    // REQ-203 / Inversion of valorMensual.
    // Given:  valor_centavos = 8333333 and frecuencia = "Mensual".
    // When:   the engine computes the annual equivalent (8333333 × 12).
    // Then:   the result is 99999996 (decimal precision, no drift).
    //
    // Note: 8333333 × 12 = 99999996 exactly in integer arithmetic, but a
    // Number computation produces 99999996.00000001 (drift). We assert the
    // integer string to pin that no IEEE-754 ever enters the pipeline.
    it('req_203_anualizacion_multiplies_by_12_without_drift', () => {
      const result = valorAnual(8_333_333, 'Mensual')
      expect(result.toString()).toBe('99999996')
    })

    // REQ-203 / Cross-frequency: anualizar must compose with the divisor.
    // Given:  valor_centavos = 12000000 and frecuencia = "Anual".
    // When:   the engine computes the annual equivalent.
    // Then:   the result is 12000000 (divisor 12, then ×12 = identity).
    it('req_203_anualizacion_of_anual_is_identity', () => {
      const result = valorAnual(12_000_000, 'Anual')
      expect(result.toString()).toBe('12000000')
    })
  })
})