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
import { parseAmount, toCentavos, formatCentavos, parsePesosInput } from '../money'

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

    // Regression: Matriz UI was rendering "61.666,66.66666662693024"
    // for `formatCentavos(6166666.66)`. Root cause: the implementation
    // did `centavos % 100` directly on a float, so IEEE 754 garbage
    // (e.g. `6166666.66 % 100 === 66.66666662693024`) leaked into the
    // output as 4+ digit fractional sequences. The fix rounds the input
    // to integer centavos FIRST; this test pins that contract — the
    // output must match canonical es-ES format with at most two
    // fractional digits (never a long decimal run).
    it('req_202_format_centavos_handles_float_with_decimal_garbage', () => {
      const result = formatCentavos(6166666.66)
      // Strip the grouping-thousand dots so the regex no longer flags them.
      const noGrouping = result.replace(/\./g, '')
      // Only digits and at most two fractional digits after the comma.
      expect(noGrouping).toMatch(/^-?\d+(,\d{1,2})?$/)
      // No long decimal run leaked (the original bug showed ".66000000014901").
      expect(result).not.toMatch(/,\d{3,}/)
    })

    // The same float garbage pattern, but with a value that rounds
    // predictably: Math.round(2300000.0) === 2300000, so no decimals.
    it('req_202_format_centavos_float_2300000_renders_clean', () => {
      expect(formatCentavos(2300000)).toBe('23.000')
      expect(formatCentavos(2300000.0)).toBe('23.000')
    })

    // No regression for the integer-input path: clean integer centavos
    // must still render exactly as before. 99 centavos → "0,99"
    // (intPart=0 because 99<100, centsPart=99). 2300000 centavos →
    // "23.000" (no cents shown). These mirror the es-ES thousand grouping
    // + "hide decimals when cents==0" contract.
    it('req_202_format_centavos_integer_input_unchanged', () => {
      expect(formatCentavos(6166666)).toBe('61.666,66')
      expect(formatCentavos(6166667)).toBe('61.666,67')
      expect(formatCentavos(2300000)).toBe('23.000')
      expect(formatCentavos(99)).toBe('0,99')
    })
  })

  // ------------------------------------------------------------------------
  // Slice 11 bugfix: `parsePesosInput` — helper para el Simulador.
  //
  // El bug original: el Simulador interpretaba el input del usuario como
  // CENTAVOS literales, así que tipear "150000" mandaba 150.000 centavos
  // (= $1.500) al backend en lugar de 15.000.000 centavos (= $150.000).
  // Peor: el campo re-renderizaba con el valor formateado a pesos después
  // del debounce, lo que borraba los dígitos que el usuario estaba
  // tipeando (UX rota). El fix: este helper convierte PESOS → CENTAVOS
  // (×100, redondeado) ANTES de mandar al backend. La regla de REQ-202
  // ("multiplicar por 100 antes de persistir") ya existía en
  // `toCentavos`; `parsePesosInput` la aplica en la frontera del input
  // del Simulador.
  // ------------------------------------------------------------------------

  describe('parsePesosInput — PESOS → CENTAVOS (Simulador bugfix)', () => {
    // Happy path: el usuario tipea PESOS (no centavos), el helper
    // devuelve CENTAVOS. Cubrimos todos los formatos localized
    // soportados (sin separador, con miles, con decimal, ambos).
    it('parsePesosInput converts pesos to centavos with Math.round', () => {
      // 1 peso = 100 centavos
      expect(parsePesosInput('1')).toBe(100)
      expect(parsePesosInput('1.5')).toBe(150)
      // Sin separadores: "150000" pesos = 15.000.000 centavos.
      expect(parsePesosInput('150000')).toBe(15_000_000)
      // Punto como separador de miles: "150.000" = "150000" = 15M centavos.
      expect(parsePesosInput('150.000')).toBe(15_000_000)
      // Coma como separador decimal: "150000,50" pesos = 15.000.050 centavos.
      expect(parsePesosInput('150000,50')).toBe(15_000_050)
      // Ambos: "150.000,50" = "150000.50" pesos = 15.000.050 centavos.
      expect(parsePesosInput('150.000,50')).toBe(15_000_050)
    })

    // Casos de input inválido: el helper DEBE devolver `null` para que
    // el caller NO dispare el upsert. Esto evita corromper la propuesta
    // del Simulador con un valor NaN o negativo.
    it('parsePesosInput returns null for invalid input', () => {
      expect(parsePesosInput('')).toBeNull()
      expect(parsePesosInput('abc')).toBeNull()
      expect(parsePesosInput('-1')).toBeNull()
    })
  })
})