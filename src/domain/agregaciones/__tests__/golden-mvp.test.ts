// Tests for REQ-301 / REQ-605: golden lock-in of the matriz against the
// 32-row Excel dataset.
//
// Spec:    openspec/changes/mvp-financiero-local-first/spec.md §REQ-301,
//          §REQ-605 (cierre al centavo contra Excel).
// Design:  openspec/changes/mvp-financiero-local-first/design.md §3 (the
//          MIS FINANZAS dataset reconstructed as 32 rows), §9.4 (Excel
//          cross-check, total ingresos = 7,200,000 / total gastos =
//          8,345,000 / FCL = -1,145,000 / anual ingresos = 86,400,000).
// Tasks:   T-301, T-302, T-X01 (golden fixture), T-503 (KPIs downstream).
// Test #:  slice 4 / frontend / REQ-301 + REQ-605 (4 golden tests).
//
// RED PHASE: this file imports `calcularMatriz` from `..` (the matriz
// module that does NOT exist yet — slice 4 / T-302 introduces it in
// the GREEN phase). `pnpm test` MUST fail at the import-resolution step
// before any `it()` runs. That is the expected RED state.
//
// These tests are the **most important contract in slice 4**: if any of
// them regresses at any point in the project lifecycle, the MVP loses
// its "cierre al centavo contra Excel" guarantee. Treat them as
// integration tests that lock the algorithmic contract against real
// data, not toy fixtures.
//
// Source-of-truth values (from `docs/analisis-plantilla-financiera.md`):
//   * `PRESUPUESTO!F12` = $7,200,000.00 (total ingresos mensual)
//   * `PRESUPUESTO!F24` = $8,345,000.00 (total gastos mensual)
//   * `PRESUPUESTO!F27` = -$1,145,000.00 (flujo de caja libre)
//   * `PRESUPUESTO!J12` = $86,400,000.00 (total ingresos anual)
//
// Notes about the fixture encoding:
//   * `valor_centavos` = declared amount in PESOS × 100. E.g. $4,000,000
//     declared → 400_000_000 (4,000,000 in Decimal). This matches the
//     SQL convention used by `domain/precision/money.ts#toCentavos`.
//   * The 6 ingresos: nombres like "Salario", "Prima salario", etc.
//   * The 26 gastos: nombres reconstructed from the §3.1 table.
//   * Categorias are a minimal catalog covering only the categories
//     that appear in this dataset (4 Ingreso + 10 Gasto), with stable
//     numeric ids so the fixture is independent of seed ordering.

import { describe, it, expect } from 'vitest'
import { Decimal } from '../../precision/money'
import { calcularMatriz } from '..'
import type { TransaccionMin, CategoriaMin } from '..'

// ---------------------------------------------------------------------------
// The canonical 32-row dataset.
// ---------------------------------------------------------------------------

/**
 * All `Categorias` referenced by the 32-row fixture. Stable numeric ids
 * are baked into the test so the assertions stay deterministic even if
 * the seed in `001_inicial.sql` ever reorders. `grupo_pertenencia` here
 * is the TS-side alias for the SQL `Categorias.tipo_flujo`.
 */
function categorias32(): CategoriaMin[] {
  return [
    // Ingresos
    { id: 1, nombre: 'Salario', grupo_pertenencia: 'INGRESO' },
    { id: 2, nombre: 'Otros ingresos', grupo_pertenencia: 'INGRESO' },
    { id: 3, nombre: 'Negocio', grupo_pertenencia: 'INGRESO' },
    { id: 4, nombre: 'Inversion', grupo_pertenencia: 'INGRESO' },
    // Gastos
    { id: 5, nombre: 'Hogar', grupo_pertenencia: 'GASTO' },
    { id: 6, nombre: 'Alimentacion', grupo_pertenencia: 'GASTO' },
    { id: 7, nombre: 'Provisiones', grupo_pertenencia: 'GASTO' },
    { id: 8, nombre: 'Otros gastos', grupo_pertenencia: 'GASTO' },
    { id: 9, nombre: 'Transporte', grupo_pertenencia: 'GASTO' },
    { id: 10, nombre: 'Familia', grupo_pertenencia: 'GASTO' },
    { id: 11, nombre: 'Deudas entidades', grupo_pertenencia: 'GASTO' },
    { id: 12, nombre: 'Entretenimiento', grupo_pertenencia: 'GASTO' },
    { id: 13, nombre: 'Impuestos', grupo_pertenencia: 'GASTO' },
  ]
}

/**
 * The 32-row Excel fixture. Each row has all the columns the matrix
 * layer needs. `valor_centavos` is **declared** amount (already in
 * centavos), and the matrix MUST normalize it via the frecuencia
 * divisor before summing — that's the heart of REQ-203.
 *
 * Source: `docs/analisis-plantilla-financiera.md` §3.1 — the tables of
 * 6 ingresos + 26 gastos from `MIS FINANZAS` (Excel rows 7..12 for
 * ingresos, rows 7..32 for gastos).
 */
function transacciones32(): TransaccionMin[] {
  return [
    // ====== 6 Ingresos ======
    {
      tipo_flujo: 'Ingreso',
      categoria_id: 1, // Salario
      concepto: 'Salario',
      comportamiento: 'Fijo',
      frecuencia: 'Mensual',
      valor_centavos: 400_000_000, // $4,000,000
    },
    {
      tipo_flujo: 'Ingreso',
      categoria_id: 2, // Otros ingresos
      concepto: 'Prima salario',
      comportamiento: 'Fijo',
      frecuencia: 'Semestral',
      valor_centavos: 200_000_000, // $2,000,000 semestral
    },
    {
      tipo_flujo: 'Ingreso',
      categoria_id: 3, // Negocio
      concepto: 'Proyectos asesorias',
      comportamiento: 'Variable',
      frecuencia: 'Trimestral',
      valor_centavos: 350_000_000, // $3,500,000 trimestral
    },
    {
      tipo_flujo: 'Ingreso',
      categoria_id: 4, // Inversion
      concepto: 'Dividendos inversiones',
      comportamiento: 'Variable',
      frecuencia: 'Anual',
      valor_centavos: 200_000_000, // $2,000,000 anual
    },
    {
      tipo_flujo: 'Ingreso',
      categoria_id: 2, // Otros ingresos
      concepto: 'Bonos adicionales',
      comportamiento: 'Variable',
      frecuencia: 'Trimestral',
      valor_centavos: 250_000_000, // $2,500,000 trimestral
    },
    {
      tipo_flujo: 'Ingreso',
      categoria_id: 2, // Otros ingresos
      concepto: 'Otro',
      comportamiento: 'Variable',
      frecuencia: 'Mensual',
      valor_centavos: 70_000_000, // $700,000
    },

    // ====== 26 Gastos ======
    {
      tipo_flujo: 'Gasto',
      categoria_id: 5, // Hogar
      concepto: 'Arriendo',
      naturaleza_necesidad: 'Necesario',
      frecuencia: 'Mensual',
      valor_centavos: 170_000_000,
    },
    {
      tipo_flujo: 'Gasto',
      categoria_id: 5, // Hogar
      concepto: 'Administracion',
      naturaleza_necesidad: 'Necesario',
      frecuencia: 'Mensual',
      valor_centavos: 15_000_000,
    },
    {
      tipo_flujo: 'Gasto',
      categoria_id: 6, // Alimentacion
      concepto: 'Mercado',
      naturaleza_necesidad: 'Necesario',
      frecuencia: 'Mensual',
      valor_centavos: 50_000_000,
    },
    {
      tipo_flujo: 'Gasto',
      categoria_id: 5, // Hogar
      concepto: 'Agua',
      naturaleza_necesidad: 'Necesario',
      frecuencia: 'Bimensual',
      valor_centavos: 15_000_000,
    },
    {
      tipo_flujo: 'Gasto',
      categoria_id: 5, // Hogar
      concepto: 'Luz',
      naturaleza_necesidad: 'Necesario',
      frecuencia: 'Mensual',
      valor_centavos: 12_000_000,
    },
    {
      tipo_flujo: 'Gasto',
      categoria_id: 5, // Hogar
      concepto: 'Gas',
      naturaleza_necesidad: 'Necesario',
      frecuencia: 'Mensual',
      valor_centavos: 4_000_000,
    },
    {
      tipo_flujo: 'Gasto',
      categoria_id: 7, // Provisiones
      concepto: 'Provisiones pagos',
      naturaleza_necesidad: 'Necesario',
      frecuencia: 'Mensual',
      valor_centavos: 20_000_000,
    },
    {
      tipo_flujo: 'Gasto',
      categoria_id: 8, // Otros gastos
      concepto: 'Plan de datos',
      naturaleza_necesidad: 'No tan necesario',
      frecuencia: 'Mensual',
      valor_centavos: 8_000_000,
    },
    {
      tipo_flujo: 'Gasto',
      categoria_id: 9, // Transporte
      concepto: 'Gasolina',
      naturaleza_necesidad: 'Necesario',
      frecuencia: 'Mensual',
      valor_centavos: 15_000_000,
    },
    {
      tipo_flujo: 'Gasto',
      categoria_id: 9, // Transporte
      concepto: 'Mantenimiento carro',
      naturaleza_necesidad: 'Necesario',
      frecuencia: 'Trimestral',
      valor_centavos: 50_000_000,
    },
    {
      tipo_flujo: 'Gasto',
      categoria_id: 9, // Transporte
      concepto: 'Seguro carro',
      naturaleza_necesidad: 'No tan necesario',
      frecuencia: 'Anual',
      valor_centavos: 100_000_000,
    },
    {
      tipo_flujo: 'Gasto',
      categoria_id: 8, // Otros gastos
      concepto: 'Gimnasio',
      naturaleza_necesidad: 'No tan necesario',
      frecuencia: 'Anual',
      valor_centavos: 90_000_000,
    },
    {
      tipo_flujo: 'Gasto',
      categoria_id: 10, // Familia
      concepto: 'Internet y telefono',
      naturaleza_necesidad: 'No necesario',
      frecuencia: 'Mensual',
      valor_centavos: 12_000_000,
    },
    {
      tipo_flujo: 'Gasto',
      categoria_id: 10, // Familia
      concepto: 'Streaming',
      naturaleza_necesidad: 'No tan necesario',
      frecuencia: 'Mensual',
      valor_centavos: 12_000_000,
    },
    {
      tipo_flujo: 'Gasto',
      categoria_id: 9, // Transporte
      concepto: 'Taxi/Uber/Bus',
      naturaleza_necesidad: 'No tan necesario',
      frecuencia: 'Mensual',
      valor_centavos: 14_000_000,
    },
    {
      tipo_flujo: 'Gasto',
      categoria_id: 11, // Deudas entidades
      concepto: 'Credito carro',
      naturaleza_necesidad: 'Necesario',
      frecuencia: 'Mensual',
      valor_centavos: 120_000_000,
    },
    {
      tipo_flujo: 'Gasto',
      categoria_id: 12, // Entretenimiento
      concepto: 'Viajes',
      naturaleza_necesidad: 'No tan necesario',
      frecuencia: 'Semestral',
      valor_centavos: 400_000_000,
    },
    {
      tipo_flujo: 'Gasto',
      categoria_id: 12, // Entretenimiento
      concepto: 'Restaurantes',
      naturaleza_necesidad: 'No necesario',
      frecuencia: 'Mensual',
      valor_centavos: 60_000_000,
    },
    {
      tipo_flujo: 'Gasto',
      categoria_id: 10, // Familia
      concepto: 'Peluqueria perritos',
      naturaleza_necesidad: 'Necesario',
      frecuencia: 'Mensual',
      valor_centavos: 15_000_000,
    },
    {
      tipo_flujo: 'Gasto',
      categoria_id: 10, // Familia
      concepto: 'Seguro medico',
      naturaleza_necesidad: 'Necesario',
      frecuencia: 'Mensual',
      valor_centavos: 40_000_000,
    },
    {
      tipo_flujo: 'Gasto',
      categoria_id: 12, // Entretenimiento
      concepto: 'Centro comercial',
      naturaleza_necesidad: 'No necesario',
      frecuencia: 'Mensual',
      valor_centavos: 45_000_000,
    },
    {
      tipo_flujo: 'Gasto',
      categoria_id: 13, // Impuestos
      concepto: 'Impuestos',
      naturaleza_necesidad: 'Necesario',
      frecuencia: 'Anual',
      valor_centavos: 130_000_000,
    },
    {
      tipo_flujo: 'Gasto',
      categoria_id: 10, // Familia
      concepto: 'Juguetes perritos',
      naturaleza_necesidad: 'No necesario',
      frecuencia: 'Bimensual',
      valor_centavos: 10_000_000,
    },
    {
      tipo_flujo: 'Gasto',
      categoria_id: 8, // Otros gastos
      concepto: 'Peluqueria',
      naturaleza_necesidad: 'Necesario',
      frecuencia: 'Mensual',
      valor_centavos: 10_000_000,
    },
    {
      tipo_flujo: 'Gasto',
      categoria_id: 6, // Alimentacion
      concepto: 'Domicilios',
      naturaleza_necesidad: 'No necesario',
      frecuencia: 'Mensual',
      valor_centavos: 40_000_000,
    },
    {
      tipo_flujo: 'Gasto',
      categoria_id: 8, // Otros gastos
      concepto: 'Ropa',
      naturaleza_necesidad: 'No tan necesario',
      frecuencia: 'Trimestral',
      valor_centavos: 150_000_000,
    },
  ]
}

// ---------------------------------------------------------------------------
// Helpers: a Decimal-based strict-equal assert that also tolerates the
// rounding noise decimal.js gives back from repeating decimals (e.g.
// 1,166,666.667... vs 1,166,666.66...). Excel uses display = 2 decimals,
// but the spec says we close **to the cent**. The fixture has no
// fractional centavo because all the raw/normalized decimals either
// divide evenly or end in .67 cents, so we use equals() directly for the
// big totals and `difference.lt(0.01)` for per-category checks.
// ---------------------------------------------------------------------------

/**
 * Asserts that `actual` equals `expected` to the cent (difference in
 * absolute centavos < 0.01). Used for the big golden totals where the
 * cumulative rounding drift over 32 rows must still close.
 */
function expectCloseToCentavo(actual: Decimal, expected: Decimal, label: string) {
  const diff = actual.minus(expected).abs()
  if (diff.gte(new Decimal('0.01'))) {
    throw new Error(
      `${label}: esperado ${expected.toString()}, actual ${actual.toString()}, diff ${diff.toString()}`,
    )
  }
  expect(diff.lt(new Decimal('0.01'))).toBe(true)
}

// ---------------------------------------------------------------------------
// Golden test cases — these are the entire MVP contract against Excel.
// ---------------------------------------------------------------------------

describe('REQ-301 + REQ-605: golden test contra dataset 32 transacciones', () => {
  it('req_301_golden_total_ingresos_es_7_200_000', () => {
    const matriz = calcularMatriz(transacciones32(), categorias32())
    // Excel PRESUPUESTO!F12 = 7,200,000.00 = 720_000_000 centavos.
    expectCloseToCentavo(
      matriz.totalIngresos,
      new Decimal(720_000_000),
      'totalIngresos',
    )
  })

  it('req_301_golden_total_gastos_es_8_345_000', () => {
    const matriz = calcularMatriz(transacciones32(), categorias32())
    // Excel PRESUPUESTO!F24 = 8,345,000.00 = 834_500_000 centavos.
    expectCloseToCentavo(
      matriz.totalGastos,
      new Decimal(834_500_000),
      'totalGastos',
    )
  })

  it('req_301_golden_flujo_caja_libre_inicial_es_negativo_1_145_000', () => {
    const matriz = calcularMatriz(transacciones32(), categorias32())
    // Excel PRESUPUESTO!F27 = -1,145,000.00 = -114_500_000 centavos.
    // FA2 inicial NO descuenta salario personal objetivo (decision del
    // Excel, ver §6.2 del analisis-plantilla-financiera.md).
    expectCloseToCentavo(
      matriz.flujoCajaLibre,
      new Decimal(-114_500_000),
      'flujoCajaLibre',
    )
  })

  it('req_301_golden_anualizacion_ingresos_es_86_400_000', () => {
    const matriz = calcularMatriz(transacciones32(), categorias32())
    // Excel PRESUPUESTO!J12 = 86,400,000.00 = 12 × 7,200,000.
    expectCloseToCentavo(
      matriz.totalIngresosAnual,
      new Decimal(8_640_000_000),
      'totalIngresosAnual',
    )
  })
})
