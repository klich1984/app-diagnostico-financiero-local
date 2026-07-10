// Tests for REQ-301: aggregation matrix (matriz SUMIFS virtual).
//
// Spec:    openspec/changes/mvp-financiero-local-first/spec.md §REQ-301
// Design:  openspec/changes/mvp-financiero-local-first/design.md §9.1
//          (definiciones), §9.4 (cierre contra Excel).
// Tasks:   T-301 (usePresupuestoStore), T-302 (matriz SUMIFS).
// Test #:  slice 4 / frontend / REQ-301 (9 tests).
//
// RED PHASE: this file imports from `..`, which does NOT exist (the
// module `src/domain/agregaciones/matriz.ts` is created in the GREEN
// phase, T-302). `pnpm test` MUST fail at the import-resolution step —
// that's the expected RED state. The IMPL phase will introduce the file
// exporting the interfaces and `calcularMatriz` shown below.
//
// Pin of signatures for the IMPL phase (from the user's prompt — binding):
//
//   export interface MatrizIngreso { ... }
//   export interface MatrizGasto { ... }
//   export interface MatrizPresupuesto { ... }
//   export function calcularMatriz(
//     transacciones: TransaccionMin[],
//     categorias: CategoriaMin[],
//   ): MatrizPresupuesto
//
// The implementation MUST use decimal.js (Decimal, configured at
// `domain/precision/money.ts` to 32 digits + ROUND_HALF_EVEN) so that
// divisions like 3500000000/3 don't lose precision. Plain Number would
// introduce IEEE-754 drift that the Excel doesn't have, which would
// break the golden test in REQ-605.
//
// Test strategies:
//   1. Synthetic 2-3 row fixtures — quick behavioral checks (one per
//      scenario from the user's prompt). These prove the matrix
//      correctly partitions by categoria + naturaleza + comportamiento.
//   2. The golden-mvp.test.ts file in this folder runs the 32-row
//      dataset and asserts the Excel's ground truth (7,200,000 /
//      8,345,000 / -1,145,000 / 86,400,000).

import { describe, it, expect } from 'vitest'
import { Decimal } from '../../precision/money'
import { calcularMatriz } from '..'
import type { TransaccionMin, CategoriaMin } from '..'

// ---------------------------------------------------------------------------
// Test helpers — keep fixtures tiny and readable.
// ---------------------------------------------------------------------------

/**
 * Build a `TransaccionMin` row with sensible defaults so each test only
 * states what's actually relevant to the assertion. Defaults:
 *   tipo_flujo  = 'Ingreso'
 *   categoria_id = 1
 *   frecuencia  = 'Mensual'
 *   valor_centavos = 0  (caller must set non-zero)
 */
function transaccion(partial: Partial<TransaccionMin> & Pick<TransaccionMin, 'valor_centavos'>): TransaccionMin {
  return {
    tipo_flujo: 'Ingreso',
    categoria_id: 1,
    frecuencia: 'Mensual',
    valor_centavos: partial.valor_centavos,
    ...partial,
  } as TransaccionMin
}

/** Small catalog of categorias used across the tests below. */
function categoriasFixture(): CategoriaMin[] {
  return [
    { id: 1, nombre: 'Salario', grupo_pertenencia: 'INGRESO' },
    { id: 2, nombre: 'Negocio', grupo_pertenencia: 'INGRESO' },
    { id: 3, nombre: 'Otros ingresos', grupo_pertenencia: 'INGRESO' },
    { id: 4, nombre: 'Hogar', grupo_pertenencia: 'GASTO' },
    { id: 5, nombre: 'Alimentacion', grupo_pertenencia: 'GASTO' },
    { id: 6, nombre: 'Entretenimiento', grupo_pertenencia: 'GASTO' },
    { id: 7, nombre: 'Otros gastos', grupo_pertenencia: 'GASTO' },
  ]
}

// ---------------------------------------------------------------------------
// Synthetic (non-golden) tests: one per scenario in the user's prompt.
// Each keeps the dataset 2-3 rows so the expected sum is obvious.
// ---------------------------------------------------------------------------

describe('REQ-301: matriz de agregación por categoría y naturaleza', () => {
  describe('agregación de ingresos', () => {
    it('req_301_matriz_agrega_ingresos_por_categoria', () => {
      const cats = categoriasFixture()
      const txs: TransaccionMin[] = [
        transaccion({
          tipo_flujo: 'Ingreso',
          categoria_id: 1,
          comportamiento: 'Fijo',
          valor_centavos: 300_000_000, // $3,000,000
        }),
        transaccion({
          tipo_flujo: 'Ingreso',
          categoria_id: 1,
          comportamiento: 'Variable',
          valor_centavos: 100_000_000, // $1,000,000
        }),
        transaccion({
          tipo_flujo: 'Ingreso',
          categoria_id: 2, // Negocio — separate bucket
          comportamiento: 'Variable',
          valor_centavos: 200_000_000, // $2,000,000
        }),
      ]

      const matriz = calcularMatriz(txs, cats)
      const salario = matriz.ingresos.find((r) => r.categoria === 'Salario')
      const negocio = matriz.ingresos.find((r) => r.categoria === 'Negocio')

      expect(salario).toBeDefined()
      expect(negocio).toBeDefined()
      // Both rows in Salario sum into the bucket's `total` regardless of
      // comportamiento split.
      expect(salario!.total.equals(new Decimal(400_000_000))).toBe(true)
      expect(negocio!.total.equals(new Decimal(200_000_000))).toBe(true)
    })

    it('req_301_matriz_separa_fijo_de_variable', () => {
      const cats = categoriasFixture()
      const txs: TransaccionMin[] = [
        transaccion({
          tipo_flujo: 'Ingreso',
          categoria_id: 1,
          comportamiento: 'Fijo',
          valor_centavos: 400_000_000,
        }),
        transaccion({
          tipo_flujo: 'Ingreso',
          categoria_id: 1,
          comportamiento: 'Variable',
          valor_centavos: 100_000_000,
        }),
      ]

      const matriz = calcularMatriz(txs, cats)
      const salario = matriz.ingresos.find((r) => r.categoria === 'Salario')

      expect(salario).toBeDefined()
      expect(salario!.fijo.equals(new Decimal(400_000_000))).toBe(true)
      expect(salario!.variable.equals(new Decimal(100_000_000))).toBe(true)
      expect(salario!.total.equals(new Decimal(500_000_000))).toBe(true)
    })
  })

  describe('agregación de gastos', () => {
    it('req_301_matriz_agrega_gastos_por_categoria', () => {
      const cats = categoriasFixture()
      const txs: TransaccionMin[] = [
        transaccion({
          tipo_flujo: 'Gasto',
          categoria_id: 4, // Hogar
          naturaleza_necesidad: 'Necesario',
          valor_centavos: 170_000_000, // $1,700,000
        }),
        transaccion({
          tipo_flujo: 'Gasto',
          categoria_id: 4,
          naturaleza_necesidad: 'Necesario',
          valor_centavos: 30_000_000, // $300,000
        }),
        transaccion({
          tipo_flujo: 'Gasto',
          categoria_id: 5, // Alimentacion
          naturaleza_necesidad: 'Necesario',
          valor_centavos: 50_000_000, // $500,000
        }),
      ]

      const matriz = calcularMatriz(txs, cats)
      const hogar = matriz.gastos.find((r) => r.categoria === 'Hogar')
      const alimentacion = matriz.gastos.find((r) => r.categoria === 'Alimentacion')

      expect(hogar).toBeDefined()
      expect(alimentacion).toBeDefined()
      expect(hogar!.total.equals(new Decimal(200_000_000))).toBe(true)
      expect(alimentacion!.total.equals(new Decimal(50_000_000))).toBe(true)
    })

    it('req_301_matriz_separa_necesidad_en_3_niveles', () => {
      const cats = categoriasFixture()
      const txs: TransaccionMin[] = [
        transaccion({
          tipo_flujo: 'Gasto',
          categoria_id: 7, // Otros gastos
          naturaleza_necesidad: 'Necesario',
          valor_centavos: 100_000_000, // $1,000,000
        }),
        transaccion({
          tipo_flujo: 'Gasto',
          categoria_id: 7,
          naturaleza_necesidad: 'No tan necesario',
          valor_centavos: 200_000_000, // $2,000,000
        }),
        transaccion({
          tipo_flujo: 'Gasto',
          categoria_id: 7,
          naturaleza_necesidad: 'No necesario',
          valor_centavos: 300_000_000, // $3,000,000
        }),
      ]

      const matriz = calcularMatriz(txs, cats)
      const otros = matriz.gastos.find((r) => r.categoria === 'Otros gastos')

      expect(otros).toBeDefined()
      expect(otros!.necesario.equals(new Decimal(100_000_000))).toBe(true)
      expect(otros!.noTanNecesario.equals(new Decimal(200_000_000))).toBe(true)
      expect(otros!.noNecesario.equals(new Decimal(300_000_000))).toBe(true)
      expect(otros!.total.equals(new Decimal(600_000_000))).toBe(true)
    })
  })

  describe('normalización temporal', () => {
    it('req_301_matriz_normaliza_frecuencia_a_mensual', () => {
      const cats = categoriasFixture()
      // 1 Trimestral gasto of $300,000 → $100,000 monthly equivalent.
      // In centavos: 30_000_000 declared (trimestral) → 10_000_000 mensual.
      const txs: TransaccionMin[] = [
        transaccion({
          tipo_flujo: 'Gasto',
          categoria_id: 4,
          naturaleza_necesidad: 'Necesario',
          frecuencia: 'Trimestral',
          valor_centavos: 30_000_000, // $300,000 trimestral
        }),
      ]

      const matriz = calcularMatriz(txs, cats)
      const hogar = matriz.gastos.find((r) => r.categoria === 'Hogar')

      expect(hogar).toBeDefined()
      // Decimal division: 30_000_000 / 3 = 10_000_000 exact (no drift).
      expect(hogar!.total.equals(new Decimal(10_000_000))).toBe(true)
      expect(hogar!.necesario.equals(new Decimal(10_000_000))).toBe(true)
    })
  })

  describe('totales agregados', () => {
    it('req_301_matriz_total_ingresos_mensual_es_correcto', () => {
      const cats = categoriasFixture()
      const txs: TransaccionMin[] = [
        transaccion({
          tipo_flujo: 'Ingreso',
          categoria_id: 1,
          comportamiento: 'Fijo',
          valor_centavos: 400_000_000,
        }),
        transaccion({
          tipo_flujo: 'Ingreso',
          categoria_id: 2,
          comportamiento: 'Variable',
          valor_centavos: 200_000_000,
        }),
        transaccion({
          tipo_flujo: 'Ingreso',
          categoria_id: 3,
          comportamiento: 'Variable',
          valor_centavos: 100_000_000,
        }),
      ]

      const matriz = calcularMatriz(txs, cats)
      expect(matriz.totalIngresos.equals(new Decimal(700_000_000))).toBe(true)
    })

    it('req_301_matriz_total_gastos_mensual_es_correcto', () => {
      const cats = categoriasFixture()
      const txs: TransaccionMin[] = [
        transaccion({
          tipo_flujo: 'Gasto',
          categoria_id: 4,
          naturaleza_necesidad: 'Necesario',
          valor_centavos: 100_000_000,
        }),
        transaccion({
          tipo_flujo: 'Gasto',
          categoria_id: 5,
          naturaleza_necesidad: 'No tan necesario',
          valor_centavos: 200_000_000,
        }),
        transaccion({
          tipo_flujo: 'Gasto',
          categoria_id: 6,
          naturaleza_necesidad: 'No necesario',
          valor_centavos: 300_000_000,
        }),
      ]

      const matriz = calcularMatriz(txs, cats)
      expect(matriz.totalGastos.equals(new Decimal(600_000_000))).toBe(true)
    })

    it('req_301_matriz_flujo_caja_libre_ingresos_menos_gastos', () => {
      const cats = categoriasFixture()
      // Ingresos 700, Gastos 600 → FCL 100.
      const txs: TransaccionMin[] = [
        transaccion({
          tipo_flujo: 'Ingreso',
          categoria_id: 1,
          comportamiento: 'Fijo',
          valor_centavos: 400_000_000,
        }),
        transaccion({
          tipo_flujo: 'Ingreso',
          categoria_id: 2,
          comportamiento: 'Variable',
          valor_centavos: 300_000_000,
        }),
        transaccion({
          tipo_flujo: 'Gasto',
          categoria_id: 4,
          naturaleza_necesidad: 'Necesario',
          valor_centavos: 250_000_000,
        }),
        transaccion({
          tipo_flujo: 'Gasto',
          categoria_id: 5,
          naturaleza_necesidad: 'No necesario',
          valor_centavos: 350_000_000,
        }),
      ]

      const matriz = calcularMatriz(txs, cats)
      // (400 + 300) - (250 + 350) = 100 (all in $millions of centavos).
      expect(matriz.flujoCajaLibre.equals(new Decimal(100_000_000))).toBe(true)
    })

    it('REQ-301: Ingreso with comportamiento undefined is counted as Variable', () => {
      // Bug: the form sends `comportamiento: null` for Ingreso (the field
      // only makes sense for Gasto). `calcularMatriz` used to drop those
      // rows silently, so the Ingreso columns showed 0 in the UI even
      // though the rows were persisted. Fix: treat null/undefined
      // comportamiento as Variable.
      const cats: CategoriaMin[] = [
        { id: 1, nombre: 'Salario', grupo_pertenencia: 'INGRESO' },
      ]
      const txs: Array<TransaccionMin & { id: number }> = [
        {
          id: 1,
          tipo_flujo: 'Ingreso',
          categoria_id: 1,
          frecuencia: 'Mensual',
          // comportamiento intentionally undefined — matches the form
          // contract for Ingreso rows (slice 9 form omits the field).
          valor_centavos: 600_000_000,
        },
      ]

      const matriz = calcularMatriz(txs, cats)

      expect(matriz.ingresos.length).toBe(1)
      const salario = matriz.ingresos[0]
      expect(salario.categoria).toBe('Salario')
      expect(salario.fijo.toNumber()).toBe(0)
      expect(salario.variable.toNumber()).toBe(600_000_000)
      expect(salario.total.toNumber()).toBe(600_000_000)
    })

    it('REQ-301: Ingreso with comportamiento undefined contributes to totalIngresos', () => {
      // Companion to the row-bucket test: the totals roll-up must also
      // pick up the row. If the row is dropped in the loop, `totalIngresos`
      // ends at 0 even though the bucket exists (it would be all-zero).
      const cats: CategoriaMin[] = [
        { id: 1, nombre: 'Salario', grupo_pertenencia: 'INGRESO' },
      ]
      const txs: Array<TransaccionMin & { id: number }> = [
        {
          id: 1,
          tipo_flujo: 'Ingreso',
          categoria_id: 1,
          frecuencia: 'Mensual',
          // comportamiento undefined
          valor_centavos: 600_000_000,
        },
      ]

      const matriz = calcularMatriz(txs, cats)
      expect(matriz.totalIngresos.toNumber()).toBe(600_000_000)
    })

    it('req_301_matriz_anualizacion_es_x12_del_mensual', () => {
      const cats = categoriasFixture()
      const txs: TransaccionMin[] = [
        transaccion({
          tipo_flujo: 'Ingreso',
          categoria_id: 1,
          comportamiento: 'Fijo',
          valor_centavos: 600_000_000, // $6M mensual
        }),
      ]

      const matriz = calcularMatriz(txs, cats)
      expect(matriz.totalIngresos.equals(new Decimal(600_000_000))).toBe(true)
      // Anual = 12 * Mensual.
      expect(matriz.totalIngresosAnual.equals(new Decimal(7_200_000_000))).toBe(true)
    })
  })
})
