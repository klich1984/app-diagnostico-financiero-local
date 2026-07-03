// Tests for REQ-302: distribution percentages for charts (Recharts input).
//
// Spec:    openspec/changes/mvp-financiero-local-first/spec.md §REQ-302
// Design:  openspec/changes/mvp-financiero-local-first/design.md §3 (the
//          porcentaje formulas in `PRESUPUESTO!C31 = F8 / $F$12`) +
//          §9.4 (cierre contra Excel).
// Tasks:   T-301 (usePresupuestoStore — ya provee los buckets), T-303
//          (Recharts visuals consume these percentages).
// Test #:  slice 4 / frontend / REQ-302 (5 tests).
//
// RED PHASE: this file imports `distribucionGastosPorCategoria` and
// `distribucionIngresosPorCategoria` from `..`. The module
// `src/domain/agregaciones/graficos.ts` is created in the GREEN phase
// (T-303). `pnpm test` MUST fail at the import-resolution step. That is
// the expected RED state.
//
// Pin of signatures for the IMPL phase (from the user's prompt):
//
//   export interface DistribucionPorcentual {
//     label: string
//     valor: Decimal        // absolute value in centavos
//     porcentaje: number    // 0..100, up to 2 decimal places
//   }
//   export function distribucionGastosPorCategoria(
//     transacciones: TransaccionMin[],
//     categorias: CategoriaMin[],
//   ): DistribucionPorcentual[]
//   export function distribucionIngresosPorCategoria(
//     transacciones: TransaccionMin[],
//     categorias: CategoriaMin[],
//   ): DistribucionPorcentual[]
//
// The implementation MUST:
//   1. Use decimal.js (Decimal) for `valor` (no Number — same precision
//      discipline as the matriz module).
//   2. Compute `porcentaje = valor / total * 100` and round to 2 decimals.
//      Because of rounding, N percentages may sum to ~100 ±0.01 — the
//      2nd test pins that envelope.
//   3. Return buckets ordered by `valor` DESC (the user prompt asks for
//      "ordered DESC" — Recharts renders better with leaders first).
//   4. Drop categorias that exist in the catalog but have NO transactions
//      in the input array. Empty buckets would show as 0% in the chart
//      and dilute the "weight" reading.

import { describe, it, expect } from 'vitest'
import { Decimal } from '../../precision/money'
import { distribucionGastosPorCategoria, distribucionIngresosPorCategoria } from '..'
import type { TransaccionMin, CategoriaMin } from '..'

// ---------------------------------------------------------------------------
// Shared fixtures — kept minimal so the assertions stay obvious.
// ---------------------------------------------------------------------------

/** Reusable catalog with both Ingreso and Gasto categorias. */
function categoriasFixture(): CategoriaMin[] {
  return [
    { id: 1, nombre: 'Salario', grupo_pertenencia: 'INGRESO' },
    { id: 2, nombre: 'Negocio', grupo_pertenencia: 'INGRESO' },
    { id: 3, nombre: 'Otros ingresos', grupo_pertenencia: 'INGRESO' },
    { id: 4, nombre: 'Hogar', grupo_pertenencia: 'GASTO' },
    { id: 5, nombre: 'Alimentacion', grupo_pertenencia: 'GASTO' },
    { id: 6, nombre: 'Transporte', grupo_pertenencia: 'GASTO' },
    { id: 7, nombre: 'Entretenimiento', grupo_pertenencia: 'GASTO' },
  ]
}

/**
 * Same reduced fixture used by `matriz.test.ts`. Defaults to a single
 * Ingreso row; callers overwrite what matters.
 */
function tx(partial: Partial<TransaccionMin> & Pick<TransaccionMin, 'valor_centavos'>): TransaccionMin {
  return {
    tipo_flujo: 'Ingreso',
    categoria_id: 1,
    frecuencia: 'Mensual',
    valor_centavos: partial.valor_centavos,
    ...partial,
  } as TransaccionMin
}

// ---------------------------------------------------------------------------
// Test scenarios — one per scenario in the user's prompt.
// ---------------------------------------------------------------------------

describe('REQ-302: distribución porcentual para gráficos', () => {
  it('req_302_distribucion_gastos_categorias_con_porcentaje', () => {
    // Three Gasto rows: Hogar=400, Alimentacion=200, Transporte=400
    // ─► total = 1000 → Hogar 40, Alimentacion 20, Transporte 40.
    const cats = categoriasFixture()
    const txs: TransaccionMin[] = [
      tx({
        tipo_flujo: 'Gasto',
        categoria_id: 4,
        naturaleza_necesidad: 'Necesario',
        valor_centavos: 400_000_000,
      }),
      tx({
        tipo_flujo: 'Gasto',
        categoria_id: 5,
        naturaleza_necesidad: 'Necesario',
        valor_centavos: 200_000_000,
      }),
      tx({
        tipo_flujo: 'Gasto',
        categoria_id: 6,
        naturaleza_necesidad: 'No necesario',
        valor_centavos: 400_000_000,
      }),
    ]

    const dist = distribucionGastosPorCategoria(txs, cats)
    expect(dist).toHaveLength(3)

    const hogar = dist.find((d) => d.label === 'Hogar')
    const alimentacion = dist.find((d) => d.label === 'Alimentacion')
    const transporte = dist.find((d) => d.label === 'Transporte')

    expect(hogar).toBeDefined()
    expect(alimentacion).toBeDefined()
    expect(transporte).toBeDefined()
    expect(hogar!.porcentaje).toBe(40)
    expect(alimentacion!.porcentaje).toBe(20)
    expect(transporte!.porcentaje).toBe(40)
    expect(hogar!.valor.equals(new Decimal(400_000_000))).toBe(true)
  })

  it('req_302_distribucion_porcentajes_suman_100', () => {
    // 5 categories with values 10, 20, 30, 40, 100 centavos × 1e7.
    // total = 2_000_000_000 -> percentages 5, 10, 15, 20, 50.
    // Sum must be 100 ±0.01 (rounding noise).
    const cats: CategoriaMin[] = [
      { id: 1, nombre: 'A', grupo_pertenencia: 'GASTO' },
      { id: 2, nombre: 'B', grupo_pertenencia: 'GASTO' },
      { id: 3, nombre: 'C', grupo_pertenencia: 'GASTO' },
      { id: 4, nombre: 'D', grupo_pertenencia: 'GASTO' },
      { id: 5, nombre: 'E', grupo_pertenencia: 'GASTO' },
    ]
    const txs: TransaccionMin[] = [
      tx({ tipo_flujo: 'Gasto', categoria_id: 1, naturaleza_necesidad: 'Necesario', valor_centavos: 100_000_000 }),
      tx({ tipo_flujo: 'Gasto', categoria_id: 2, naturaleza_necesidad: 'Necesario', valor_centavos: 200_000_000 }),
      tx({ tipo_flujo: 'Gasto', categoria_id: 3, naturaleza_necesidad: 'No necesario', valor_centavos: 300_000_000 }),
      tx({ tipo_flujo: 'Gasto', categoria_id: 4, naturaleza_necesidad: 'No necesario', valor_centavos: 400_000_000 }),
      tx({ tipo_flujo: 'Gasto', categoria_id: 5, naturaleza_necesidad: 'No necesario', valor_centavos: 1_000_000_000 }),
    ]

    const dist = distribucionGastosPorCategoria(txs, cats)
    const sum = dist.reduce((acc, d) => acc + d.porcentaje, 0)
    // Tolerate ±0.01 because of 2-decimal rounding per bucket.
    expect(Math.abs(sum - 100)).toBeLessThanOrEqual(0.01)
  })

  it('req_302_distribucion_ordenada_descendente', () => {
    // Hogar=100, Alimentacion=300, Transporte=200.
    // Expected order: Alimentacion (300) → Transporte (200) → Hogar (100).
    const cats = categoriasFixture()
    const txs: TransaccionMin[] = [
      tx({ tipo_flujo: 'Gasto', categoria_id: 4, naturaleza_necesidad: 'Necesario', valor_centavos: 100_000_000 }),
      tx({ tipo_flujo: 'Gasto', categoria_id: 5, naturaleza_necesidad: 'Necesario', valor_centavos: 300_000_000 }),
      tx({ tipo_flujo: 'Gasto', categoria_id: 6, naturaleza_necesidad: 'No necesario', valor_centavos: 200_000_000 }),
    ]

    const dist = distribucionGastosPorCategoria(txs, cats)
    expect(dist.map((d) => d.label)).toEqual([
      'Alimentacion',
      'Transporte',
      'Hogar',
    ])
    // Also verify the percentages are sorted descending.
    const percentages = dist.map((d) => d.porcentaje)
    for (let i = 1; i < percentages.length; i++) {
      expect(percentages[i - 1]).toBeGreaterThanOrEqual(percentages[i])
    }
  })

  it('req_302_distribucion_ignora_categorias_sin_transacciones', () => {
    // Catalog has 7 categorias but only 3 are used by the rows.
    // Result list MUST contain exactly 3 entries — no empty buckets.
    const cats = categoriasFixture()
    const txs: TransaccionMin[] = [
      tx({ tipo_flujo: 'Gasto', categoria_id: 4, naturaleza_necesidad: 'Necesario', valor_centavos: 100_000_000 }),
      tx({ tipo_flujo: 'Gasto', categoria_id: 5, naturaleza_necesidad: 'Necesario', valor_centavos: 200_000_000 }),
      tx({ tipo_flujo: 'Ingreso', categoria_id: 1, comportamiento: 'Fijo', valor_centavos: 1_000_000_000 }),
    ]

    const distGastos = distribucionGastosPorCategoria(txs, cats)
    expect(distGastos).toHaveLength(2)
    expect(distGastos.every((d) => d.label !== 'Entretenimiento')).toBe(true)

    const distIngresos = distribucionIngresosPorCategoria(txs, cats)
    expect(distIngresos).toHaveLength(1)
    expect(distIngresos[0].label).toBe('Salario')
    // Sanity: an unused categoria is absent even though it is in the
    // catalog with `grupo_pertenencia` = 'INGRESO'.
    expect(distIngresos.some((d) => d.label === 'Negocio')).toBe(false)
    expect(distIngresos.some((d) => d.label === 'Otros ingresos')).toBe(false)
  })

  it('req_302_distribucion_usa_valores_normalizados_a_mensual', () => {
    // 1 Trimestral Gasto of $300,000 → $100,000 mensual in the chart.
    // En centavos: 30_000_000 declared / 3 = 10_000_000 mensual.
    const cats: CategoriaMin[] = [
      { id: 1, nombre: 'Hogar', grupo_pertenencia: 'GASTO' },
      { id: 2, nombre: 'Alimentacion', grupo_pertenencia: 'GASTO' },
    ]
    const txs: TransaccionMin[] = [
      tx({
        tipo_flujo: 'Gasto',
        categoria_id: 1,
        naturaleza_necesidad: 'Necesario',
        frecuencia: 'Trimestral',
        valor_centavos: 30_000_000, // $300,000 trimestral
      }),
      tx({
        tipo_flujo: 'Gasto',
        categoria_id: 2,
        naturaleza_necesidad: 'Necesario',
        frecuencia: 'Mensual',
        valor_centavos: 10_000_000, // $100,000 mensual
      }),
    ]

    const dist = distribucionGastosPorCategoria(txs, cats)
    const hogar = dist.find((d) => d.label === 'Hogar')
    const alimentacion = dist.find((d) => d.label === 'Alimentacion')

    // The chart's `valor` field must show the MENSUAL equivalent of
    // the Hogar row — not the declared $300K trimestral figure. If the
    // implementation forgets the frequency normalization, the chart would
    // misrepresent the data and the user would think Hogar = 75% of
    // their budget instead of 50%.
    expect(hogar).toBeDefined()
    expect(alimentacion).toBeDefined()
    expect(hogar!.valor.equals(new Decimal(10_000_000))).toBe(true)
    expect(alimentacion!.valor.equals(new Decimal(10_000_000))).toBe(true)
    // Equal monthly weights → each label gets ~50% of the chart.
    expect(Math.abs(hogar!.porcentaje - 50)).toBeLessThanOrEqual(0.01)
    expect(Math.abs(alimentacion!.porcentaje - 50)).toBeLessThanOrEqual(0.01)
  })
})
