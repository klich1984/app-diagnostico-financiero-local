// The single most important test in the entire MVP.
//
// Tests for REQ-605: Cierre al centavo contra Excel fuente — dataset
// 32 transacciones del archivo
// `docs/Plantilla-diagnóstico-financiero-(Ejemplo).xlsx`.
//
// Spec:    `openspec/changes/mvp-financiero-local-first/spec.md` §REQ-605
//           (cierre al centavo contra Excel).
// Design:  `openspec/changes/mvp-financiero-local-first/design.md` §9.4
//           (Excel cross-check) + §12.3 (golden tests) +
//           `docs/analisis-plantilla-financiera.md` (análisis completo del Excel).
// Tasks:   T-X01 (golden fixture + tests).
// Test #:  slice 6 / frontend / REQ-605 (5 golden tests — el contrato más
//           importante del proyecto).
//
// RED PHASE: this file imports from `src/domain/kpis`, which does NOT
// exist yet. `pnpm test` MUST fail at the import-resolution step. The
// IMPL phase will introduce the module. These tests will then exercise
// the full KPI engine against the Excel source-of-truth and prove the
// "cierre al centavo" guarantee end-to-end.
//
// ## What this file locks in
//
// Every cell below is a literal value from the Excel workbook. The
// intent is that if the IMPL ever drifts from the source, ONE test in
// THIS file will break first. The accompanying comments name the cell
// (e.g. `ESTADO DE RESULTADOS!D14`) so future maintainers can verify
// directly against the workbook without reading code.
//
// If you change the golden value, you must also document the change in
// `docs/analisis-plantilla-financiera.md` and get explicit user
// approval — this is the project's single-source-of-truth contract.

import { describe, it, expect } from 'vitest'
import { Decimal } from '../../precision/money'
import type { CategoriaMin, TransaccionMin } from '../../agregaciones'
import type { Simulacion } from '../../simulador/matriz-mejorada'
import { calcularEstadoResultados } from '..'

// ---------------------------------------------------------------------------
// 32-row Excel fixture — see §3.1 of the analysis doc.
// ---------------------------------------------------------------------------

function categorias32(): CategoriaMin[] {
  return [
    { id: 1, nombre: 'Salario', grupo_pertenencia: 'INGRESO' },
    { id: 2, nombre: 'Otros ingresos', grupo_pertenencia: 'INGRESO' },
    { id: 3, nombre: 'Negocio', grupo_pertenencia: 'INGRESO' },
    { id: 4, nombre: 'Inversion', grupo_pertenencia: 'INGRESO' },
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

function transacciones32(): Array<TransaccionMin & { id: number }> {
  return [
    // ====== 6 Ingresos ======
    {
      id: 1,
      tipo_flujo: 'Ingreso',
      categoria_id: 1,
      concepto: 'Salario',
      comportamiento: 'Fijo',
      frecuencia: 'Mensual',
      valor_centavos: 400_000_000,
    },
    {
      id: 2,
      tipo_flujo: 'Ingreso',
      categoria_id: 2,
      concepto: 'Prima salario',
      comportamiento: 'Fijo',
      frecuencia: 'Semestral',
      valor_centavos: 200_000_000,
    },
    {
      id: 3,
      tipo_flujo: 'Ingreso',
      categoria_id: 3,
      concepto: 'Proyectos asesorias',
      comportamiento: 'Variable',
      frecuencia: 'Trimestral',
      valor_centavos: 350_000_000,
    },
    {
      id: 4,
      tipo_flujo: 'Ingreso',
      categoria_id: 4,
      concepto: 'Dividendos inversiones',
      comportamiento: 'Variable',
      frecuencia: 'Anual',
      valor_centavos: 200_000_000,
    },
    {
      id: 5,
      tipo_flujo: 'Ingreso',
      categoria_id: 2,
      concepto: 'Bonos adicionales',
      comportamiento: 'Variable',
      frecuencia: 'Trimestral',
      valor_centavos: 250_000_000,
    },
    {
      id: 6,
      tipo_flujo: 'Ingreso',
      categoria_id: 2,
      concepto: 'Otro',
      comportamiento: 'Variable',
      frecuencia: 'Mensual',
      valor_centavos: 70_000_000,
    },

    // ====== 26 Gastos ======
    {
      id: 7,
      tipo_flujo: 'Gasto',
      categoria_id: 5,
      concepto: 'Arriendo',
      naturaleza_necesidad: 'Necesario',
      frecuencia: 'Mensual',
      valor_centavos: 170_000_000,
    },
    {
      id: 8,
      tipo_flujo: 'Gasto',
      categoria_id: 5,
      concepto: 'Administracion',
      naturaleza_necesidad: 'Necesario',
      frecuencia: 'Mensual',
      valor_centavos: 15_000_000,
    },
    {
      id: 9,
      tipo_flujo: 'Gasto',
      categoria_id: 6,
      concepto: 'Mercado',
      naturaleza_necesidad: 'Necesario',
      frecuencia: 'Mensual',
      valor_centavos: 50_000_000,
    },
    {
      id: 10,
      tipo_flujo: 'Gasto',
      categoria_id: 5,
      concepto: 'Agua',
      naturaleza_necesidad: 'Necesario',
      frecuencia: 'Bimensual',
      valor_centavos: 15_000_000,
    },
    {
      id: 11,
      tipo_flujo: 'Gasto',
      categoria_id: 5,
      concepto: 'Luz',
      naturaleza_necesidad: 'Necesario',
      frecuencia: 'Mensual',
      valor_centavos: 12_000_000,
    },
    {
      id: 12,
      tipo_flujo: 'Gasto',
      categoria_id: 5,
      concepto: 'Gas',
      naturaleza_necesidad: 'Necesario',
      frecuencia: 'Mensual',
      valor_centavos: 4_000_000,
    },
    {
      id: 13,
      tipo_flujo: 'Gasto',
      categoria_id: 7,
      concepto: 'Provisiones pagos',
      naturaleza_necesidad: 'Necesario',
      frecuencia: 'Mensual',
      valor_centavos: 20_000_000,
    },
    {
      id: 14,
      tipo_flujo: 'Gasto',
      categoria_id: 8,
      concepto: 'Plan de datos',
      naturaleza_necesidad: 'No tan necesario',
      frecuencia: 'Mensual',
      valor_centavos: 8_000_000,
    },
    {
      id: 15,
      tipo_flujo: 'Gasto',
      categoria_id: 9,
      concepto: 'Gasolina',
      naturaleza_necesidad: 'Necesario',
      frecuencia: 'Mensual',
      valor_centavos: 15_000_000,
    },
    {
      id: 16,
      tipo_flujo: 'Gasto',
      categoria_id: 9,
      concepto: 'Mantenimiento carro',
      naturaleza_necesidad: 'Necesario',
      frecuencia: 'Trimestral',
      valor_centavos: 50_000_000,
    },
    {
      id: 17,
      tipo_flujo: 'Gasto',
      categoria_id: 9,
      concepto: 'Seguro carro',
      naturaleza_necesidad: 'No tan necesario',
      frecuencia: 'Anual',
      valor_centavos: 100_000_000,
    },
    {
      id: 18,
      tipo_flujo: 'Gasto',
      categoria_id: 8,
      concepto: 'Gimnasio',
      naturaleza_necesidad: 'No tan necesario',
      frecuencia: 'Anual',
      valor_centavos: 90_000_000,
    },
    {
      id: 19,
      tipo_flujo: 'Gasto',
      categoria_id: 10,
      concepto: 'Internet y telefono',
      naturaleza_necesidad: 'No necesario',
      frecuencia: 'Mensual',
      valor_centavos: 12_000_000,
    },
    {
      id: 20,
      tipo_flujo: 'Gasto',
      categoria_id: 10,
      concepto: 'Streaming',
      naturaleza_necesidad: 'No tan necesario',
      frecuencia: 'Mensual',
      valor_centavos: 12_000_000,
    },
    {
      id: 21,
      tipo_flujo: 'Gasto',
      categoria_id: 9,
      concepto: 'Taxi/Uber/Bus',
      naturaleza_necesidad: 'No tan necesario',
      frecuencia: 'Mensual',
      valor_centavos: 14_000_000,
    },
    {
      id: 22,
      tipo_flujo: 'Gasto',
      categoria_id: 11, // Deudas entidades
      concepto: 'Credito carro',
      naturaleza_necesidad: 'Necesario',
      frecuencia: 'Mensual',
      valor_centavos: 120_000_000,
    },
    {
      id: 23,
      tipo_flujo: 'Gasto',
      categoria_id: 12,
      concepto: 'Viajes',
      naturaleza_necesidad: 'No tan necesario',
      frecuencia: 'Semestral',
      valor_centavos: 400_000_000,
    },
    {
      id: 24,
      tipo_flujo: 'Gasto',
      categoria_id: 12,
      concepto: 'Restaurantes',
      naturaleza_necesidad: 'No necesario',
      frecuencia: 'Mensual',
      valor_centavos: 60_000_000,
    },
    {
      id: 25,
      tipo_flujo: 'Gasto',
      categoria_id: 10,
      concepto: 'Peluqueria perritos',
      naturaleza_necesidad: 'Necesario',
      frecuencia: 'Mensual',
      valor_centavos: 15_000_000,
    },
    {
      id: 26,
      tipo_flujo: 'Gasto',
      categoria_id: 10,
      concepto: 'Seguro medico',
      naturaleza_necesidad: 'Necesario',
      frecuencia: 'Mensual',
      valor_centavos: 40_000_000,
    },
    {
      id: 27,
      tipo_flujo: 'Gasto',
      categoria_id: 12,
      concepto: 'Centro comercial',
      naturaleza_necesidad: 'No necesario',
      frecuencia: 'Mensual',
      valor_centavos: 45_000_000,
    },
    {
      id: 28,
      tipo_flujo: 'Gasto',
      categoria_id: 13,
      concepto: 'Impuestos',
      naturaleza_necesidad: 'Necesario',
      frecuencia: 'Anual',
      valor_centavos: 130_000_000,
    },
    {
      id: 29,
      tipo_flujo: 'Gasto',
      categoria_id: 10,
      concepto: 'Juguetes perritos',
      naturaleza_necesidad: 'No necesario',
      frecuencia: 'Bimensual',
      valor_centavos: 10_000_000,
    },
    {
      id: 30,
      tipo_flujo: 'Gasto',
      categoria_id: 8,
      concepto: 'Peluqueria',
      naturaleza_necesidad: 'Necesario',
      frecuencia: 'Mensual',
      valor_centavos: 10_000_000,
    },
    {
      id: 31,
      tipo_flujo: 'Gasto',
      categoria_id: 6,
      concepto: 'Domicilios',
      naturaleza_necesidad: 'No necesario',
      frecuencia: 'Mensual',
      valor_centavos: 40_000_000,
    },
    {
      id: 32,
      tipo_flujo: 'Gasto',
      categoria_id: 8,
      concepto: 'Ropa',
      naturaleza_necesidad: 'No tan necesario',
      frecuencia: 'Trimestral',
      valor_centavos: 150_000_000,
    },
  ]
}

/** 12 simulation entries from Excel `OPORTUNIDADES DE MEJORA` §3.3. */
function simulaciones12(): Simulacion[] {
  return [
    { transaccion_id: 19, nuevo_valor_centavos: 5_000_000 },
    { transaccion_id: 24, nuevo_valor_centavos: 20_000_000 },
    { transaccion_id: 27, nuevo_valor_centavos: 15_000_000 },
    { transaccion_id: 29, nuevo_valor_centavos: 0 },
    { transaccion_id: 31, nuevo_valor_centavos: 10_000_000 },
    { transaccion_id: 14, nuevo_valor_centavos: 8_000_000 },
    { transaccion_id: 17, nuevo_valor_centavos: 5_000_000 },
    { transaccion_id: 18, nuevo_valor_centavos: 3_000_000 },
    { transaccion_id: 20, nuevo_valor_centavos: 4_000_000 },
    { transaccion_id: 21, nuevo_valor_centavos: 6_500_000 },
    { transaccion_id: 23, nuevo_valor_centavos: 30_000_000 },
    { transaccion_id: 32, nuevo_valor_centavos: 15_000_000 },
  ]
}

// ---------------------------------------------------------------------------
// Golden tests — REQ-605.
//
// The contract: every assertion below matches a real cell in the Excel
// workbook. If you ever update one of these values, you must ALSO
// update `docs/analisis-plantilla-financiera.md` and explain why the
// Excel no longer matches (or fix the engine to match). This is the
// user's hard rule #3 — no borrar / cambiar sin consentimiento.
// ---------------------------------------------------------------------------

describe('REQ-605: cierre al centavo contra Excel fuente (32 transacciones)', () => {
  it('req_605_golden_32_filas_ingresos_7_200_000', () => {
    const estado = calcularEstadoResultados(
      transacciones32(),
      categorias32(),
      [],
      null,
    )
    // Excel `PRESUPUESTO!F12` = $7,200,000.00 = 720_000_000 centavos.
    expect(estado.inicial.total_ingresos.equals(new Decimal(720_000_000))).toBe(true)
    // The Excel `ESTADO DE RESULTADOS!D4` mirrors PRESUPUESTO!F12.
    expect(estado.mejorado.total_ingresos.equals(new Decimal(720_000_000))).toBe(true)
  })

  it('req_605_golden_32_filas_total_gastos_inicial_8_345_000', () => {
    const estado = calcularEstadoResultados(
      transacciones32(),
      categorias32(),
      [],
      null,
    )
    // Excel `PRESUPUESTO!F24` = $8,345,000.00 = 834_500_000 centavos.
    expect(estado.inicial.total_gastos.equals(new Decimal(834_500_000))).toBe(true)

    // Sanity-check the split:
    //   gastos_deudas = 1,200,000 (Credito carro, Deudas entidades)
    expect(estado.inicial.gastos_deudas.equals(new Decimal(120_000_000))).toBe(true)
    //   gastos_necesarios (excluding deudas) = 3,860,000 = 386_000_000.
    // (Necesario total 5,060,000 − Deudas 1,200,000.)
    expect(estado.inicial.gastos_necesarios.equals(new Decimal(386_000_000))).toBe(true)
    //   gastos_no_tan_necesarios = 1,665,000.
    expect(estado.inicial.gastos_no_tan_necesarios.equals(new Decimal(166_500_000))).toBe(true)
    //   gastos_no_necesarios = 1,620,000.
    expect(estado.inicial.gastos_no_necesarios.equals(new Decimal(162_000_000))).toBe(true)
  })

  it('req_605_golden_32_filas_fa1_2_140_000', () => {
    const estado = calcularEstadoResultados(
      transacciones32(),
      categorias32(),
      [],
      null,
    )
    // Excel `ESTADO DE RESULTADOS!D14` = $2,140,000.00 = 214_000_000
    // centavos. H14 (mejorado) is the same value because Necesarios +
    // Deudas are not affected by the simulator.
    expect(estado.inicial.flujo_ahorro_1.equals(new Decimal(214_000_000))).toBe(true)
    expect(estado.mejorado.flujo_ahorro_1.equals(new Decimal(214_000_000))).toBe(true)
  })

  it('req_605_golden_32_filas_fa2_inicial_neg_1_145_000', () => {
    const estado = calcularEstadoResultados(
      transacciones32(),
      categorias32(),
      [],
      null,
    )
    // Excel `ESTADO DE RESULTADOS!D21` = -$1,145,000.00 =
    // -114_500_000 centavos. The Excel leaves `D16` blank on the
    // Inicial side (no salario descuento) — see locked decision #2.
    expect(estado.inicial.flujo_ahorro_2.equals(new Decimal(-114_500_000))).toBe(true)
    expect(estado.inicial.salario_personal_objetivo).toBeNull()
  })

  it('req_605_golden_32_filas_cap_inv_mejorada_925_000', () => {
    const estado = calcularEstadoResultados(
      transacciones32(),
      categorias32(),
      simulaciones12(),
      50_000_000, // $500,000 salario objetivo (per locked decision)
    )
    // Excel `ESTADO DE RESULTADOS!H23` = $925,000.00 = 92_500_000
    // centavos. Also matches `PRESUPUESTO MEJORADO!L25`.
    expect(estado.mejorado.capacidad_inversion.equals(new Decimal(92_500_000))).toBe(true)

    // Also lock in the intermediate FA2 mejorado = $425,000 (D21/H21).
    expect(estado.mejorado.flujo_ahorro_2.equals(new Decimal(42_500_000))).toBe(true)
    // And the total gastos mejorado = $6,275,000 (PRESUPUESTO MEJORADO!L23).
    expect(estado.mejorado.total_gastos.equals(new Decimal(627_500_000))).toBe(true)
  })

  it('req_605_golden_32_filas_ahorro_anual_24_840_000', () => {
    const estado = calcularEstadoResultados(
      transacciones32(),
      categorias32(),
      simulaciones12(),
      50_000_000,
    )
    // Excel `OPORTUNIDADES DE MEJORA!E13` = $24,840,000.00 =
    // 2_484_000_000 centavos. Derivation:
    //   ahorro mensual = inicial − mejorado = 8,345,000 − 6,275,000
    //                 = 2,070,000 = 207_000_000 centavos.
    //   ahorro anual = 2,070,000 × 12 = 24,840,000 = 2_484_000_000.
    const ahorro_mensual_centavos = estado.inicial.total_gastos.minus(
      estado.mejorado.total_gastos,
    )
    expect(ahorro_mensual_centavos.equals(new Decimal(207_000_000))).toBe(true)
    const ahorro_anual = ahorro_mensual_centavos.mul(12)
    expect(ahorro_anual.equals(new Decimal(2_484_000_000))).toBe(true)
  })
})