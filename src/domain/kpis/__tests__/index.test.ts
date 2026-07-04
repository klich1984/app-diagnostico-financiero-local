// Tests for REQ-501 + REQ-502: KPI engine (TypeScript frontend).
//
// Spec:    openspec/changes/mvp-financiero-local-first/spec.md §REQ-501
//           (Estado de Resultados dual: Inicial vs Mejorado) +
//           §REQ-502 (Salario Personal Objetivo configurable) +
//           §REQ-605 (Cierre al centavo contra Excel).
// Design:  `openspec/changes/mvp-financiero-local-first/design.md` §9.1
//           (motor de cálculo de KPIs) + §10 (Panel Simulador) +
//           §17 (R-NUEVO-*).
// Tasks:   T-501 (vista dual), T-502 (modal salario), T-503 (KPIs finales),
//           T-X01 (golden fixture).
// Test #:  slice 6 / frontend / REQ-501 + REQ-502 (8 tests — incluye
//           verificación de anualización × 12).
//
// RED PHASE: this file imports from `src/domain/kpis`, which does NOT
// exist yet. `pnpm test` MUST fail at the import-resolution step —
// that's the expected RED state. The IMPL phase will introduce the
// module exporting `EstadoResultados`, `LadoEstado`, `calcularEstado-
// Resultados`, `calcularLadoInicial`, and `calcularLadoMejorado`.
//
// ## Pin of signatures for the IMPL phase (from the user's prompt — binding):
//
//   export interface LadoEstado {
//     total_ingresos: Decimal
//     gastos_necesarios: Decimal
//     gastos_no_tan_necesarios: Decimal
//     gastos_no_necesarios: Decimal
//     gastos_deudas: Decimal
//     total_gastos: Decimal
//     flujo_caja_libre: Decimal
//     flujo_ahorro_1: Decimal
//     gastos_variables_total: Decimal
//     salario_personal_objetivo: Decimal | null
//     flujo_ahorro_2: Decimal
//     capacidad_inversion: Decimal
//     fcl_anual: Decimal
//     fa2_anual: Decimal
//     cap_inv_anual: Decimal
//   }
//
//   export interface EstadoResultados {
//     inicial: LadoEstado
//     mejorado: LadoEstado
//   }
//
//   export function calcularEstadoResultados(
//     transacciones: Array<TransaccionMin & { id: number }>,
//     categorias: CategoriaMin[],
//     simulaciones: Simulacion[],
//     salarioObjetivoCentavos: number | null,
//   ): { inicial: LadoEstado; mejorado: LadoEstado }
//
//   export function calcularLadoInicial(
//     transacciones: Array<TransaccionMin & { id: number }>,
//     categorias: CategoriaMin[],
//   ): LadoEstado
//
//   export function calcularLadoMejorado(
//     transacciones: Array<TransaccionMin & { id: number }>,
//     categorias: CategoriaMin[],
//     simulaciones: Simulacion[],
//     salarioObjetivoCentavos: number | null,
//   ): LadoEstado
//
// ## Deudas split
//
// The Excel distinguishes between "Necesario" gastos and "Deudas"
// (categoria starting with "Deuda" or "Deudas"). In our model both
// have naturaleza_necesidad='Necesario' (the schema CHECK enforces
// only one naturaleza per row), but the categoria name carries the
// info. The IMPL must classify a gasto as "deuda" when its
// categoria.nombre starts with "Deuda" (case-insensitive, accents
// tolerated). Concretely: the 32-row fixture has exactly ONE deuda
// categoria referenced — "Deudas entidades" — and ONE deuda row
// ("Credito carro" $120,000 mensual). So:
//
//   gastos_deudas = 120_000_000 centavos
//   gastos_necesarios (excluding deudas) = 386_000_000 centavos
//
// ## Golden values (Excel `docs/analisis-plantilla-financiera.md` §3.4
// y §6.2 — equivalencias de pesos a centavos multiplicando por 100):
//
//   Inicial (salarioObjetivoCentavos = null):
//     * total_ingresos        = $7,200,000.00  → 720_000_000 centavos
//     * gastos_necesarios     = $3,860,000.00  → 386_000_000 centavos
//       (NOTA: este KPI NO incluye Deudas; Necesarios = $5,060,000 -
//        $1,200,000 (deudas) = $3,860,000)
//     * gastos_deudas         = $1,200,000.00  → 120_000_000 centavos
//       (Credito carro, categoria "Deudas entidades")
//     * gastos_no_tan_necesarios = $1,665,000.00 → 166_500_000 centavos
//     * gastos_no_necesarios    = $1,620,000.00 → 162_000_000 centavos
//     * total_gastos          = $8,345,000.00  → 834_500_000 centavos
//     * flujo_caja_libre      = $7,200,000 − $8,345,000 = -$1,145,000
//                             → -114_500_000 centavos
//     * flujo_ahorro_1        = $7,200,000 − ($3,860,000 + $1,200,000)
//                             = $2,140,000
//                             → 214_000_000 centavos
//     * salario_personal_objetivo = null (lado Inicial)
//     * gastos_variables_total = $1,665,000 + $1,620,000 = $3,285,000
//                             → 328_500_000 centavos
//     * flujo_ahorro_2        = FA1 − salario(0) − variables_total
//                             = $2,140,000 − $0 − $3,285,000 = -$1,145,000
//                             → -114_500_000 centavos
//     * capacidad_inversion   = salario(0) + FA2 = -$1,145,000
//                             → -114_500_000 centavos
//
//   Mejorado (salarioObjetivoCentavos = 50_000_000 ($500,000), con
//             12 simulaciones aplicadas según Excel §3.3):
//     * total_ingresos        = $7,200,000.00 (sin cambio)
//     * gastos_variables_total = $715,000 + $500,000 = $1,215,000
//                             → 121_500_000 centavos
//     * salario_personal_objetivo = $500,000 → 50_000_000 centavos
//     * flujo_ahorro_2        = $2,140,000 − $500,000 − $1,215,000
//                             = $425,000
//                             → 42_500_000 centavos
//     * capacidad_inversion   = $500,000 + $425,000 = $925,000
//                             → 92_500_000 centavos
//
// ## Note on `gastos_necesarios` semantics (split with deudas)
//
// The Excel §3.4 "ESTADO DE RESULTADOS!D8" exposes "Gastos fijos
// necesarios = 3,660,000" by subtracting Provisiones and Deudas from
// the Necesario total. But the KPI engine's `gastos_necesarios` field
// (per the user's prompt signature) is the SUM of Necesario gastos
// **excluding** those whose categoria is a deuda — i.e., it equals the
// Excel's "Gastos fijos necesarios" + Provisiones = $3,860,000.
//
// This split lets `flujo_ahorro_1 = ingresos − (necesarios + deudas)`
// close at the golden Excel value $2,140,000.

import { describe, it, expect } from 'vitest'
import { Decimal } from '../../precision/money'
import type { CategoriaMin, TransaccionMin } from '../../agregaciones'
import type { Simulacion } from '../../simulador/matriz-mejorada'
import {
  calcularEstadoResultados,
  calcularLadoInicial,
  calcularLadoMejorado,
} from '..'

// ---------------------------------------------------------------------------
// 32-row fixture (identical to the one in slice-5 `matriz-mejorada.test.ts`
// and slice-4 `golden-mvp.test.ts`).
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
// Tests — REQ-501 (Inicial).
// ---------------------------------------------------------------------------

describe('REQ-501: calcularEstadoResultados — lado Inicial', () => {
  it('req_501_kpis_inicial_total_ingresos_es_7_200_000', () => {
    const estado = calcularEstadoResultados(
      transacciones32(),
      categorias32(),
      [],
      null,
    )
    expect(estado.inicial.total_ingresos.equals(new Decimal(720_000_000))).toBe(true)
  })

  it('req_501_kpis_inicial_fa1_es_2_140_000', () => {
    const estado = calcularEstadoResultados(
      transacciones32(),
      categorias32(),
      [],
      null,
    )
    // FA1 = ingresos − (gastos_necesarios_sin_deudas + gastos_deudas)
    //      = 7,200,000 − (3,860,000 + 1,200,000) = 2,140,000.
    expect(estado.inicial.flujo_ahorro_1.equals(new Decimal(214_000_000))).toBe(true)
  })

  it('req_501_kpis_inicial_fa2_es_neg_1_145_000', () => {
    const estado = calcularEstadoResultados(
      transacciones32(),
      categorias32(),
      [],
      null,
    )
    // FA2 = FA1 − salario(0) − variables_total
    //      = 2,140,000 − 0 − 3,285,000 = -1,145,000.
    expect(estado.inicial.flujo_ahorro_2.equals(new Decimal(-114_500_000))).toBe(true)
    expect(estado.inicial.salario_personal_objetivo).toBeNull()
  })

  it('req_501_kpis_inicial_cap_inv_es_neg_1_145_000', () => {
    const estado = calcularEstadoResultados(
      transacciones32(),
      categorias32(),
      [],
      null,
    )
    // capacidad_inversion = salario(0) + FA2 = -1,145,000.
    expect(estado.inicial.capacidad_inversion.equals(new Decimal(-114_500_000))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Tests — REQ-501 (Mejorado, con 12 simulaciones).
// ---------------------------------------------------------------------------

describe('REQ-501: calcularEstadoResultados — lado Mejorado', () => {
  it('req_501_kpis_mejorado_fa1_es_2_140_000', () => {
    const estado = calcularEstadoResultados(
      transacciones32(),
      categorias32(),
      simulaciones12(),
      50_000_000, // $500,000
    )
    // Necesarios + Deudas no se simulan → FA1 mejorado = FA1 inicial.
    expect(estado.mejorado.flujo_ahorro_1.equals(new Decimal(214_000_000))).toBe(true)
  })

  it('req_501_kpis_mejorado_fa2_es_425_000', () => {
    const estado = calcularEstadoResultados(
      transacciones32(),
      categorias32(),
      simulaciones12(),
      50_000_000,
    )
    // FA2 = FA1 − salario − variables_total_mejorado
    //      = 2,140,000 − 500,000 − 1,215,000 = 425,000.
    expect(estado.mejorado.flujo_ahorro_2.equals(new Decimal(42_500_000))).toBe(true)
  })

  it('req_501_kpis_mejorado_cap_inv_es_925_000', () => {
    const estado = calcularEstadoResultados(
      transacciones32(),
      categorias32(),
      simulaciones12(),
      50_000_000,
    )
    // capacidad_inversion = salario + FA2 = 500,000 + 425,000 = 925,000.
    expect(estado.mejorado.capacidad_inversion.equals(new Decimal(92_500_000))).toBe(true)
    expect(estado.mejorado.salario_personal_objetivo!.equals(new Decimal(50_000_000))).toBe(true)
  })

  it('req_501_kpis_mejorado_total_gastos_es_6_275_000', () => {
    const estado = calcularEstadoResultados(
      transacciones32(),
      categorias32(),
      simulaciones12(),
      50_000_000,
    )
    // Total gastos mejorado = 6,275,000 (Excel PRESUPUESTO MEJORADO!L23).
    expect(estado.mejorado.total_gastos.equals(new Decimal(627_500_000))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Test — anualización × 12 (REQ-501 / REQ-605).
// ---------------------------------------------------------------------------

describe('REQ-501 + REQ-605: anualización × 12', () => {
  it('req_501_kpis_anualizacion_es_x12', () => {
    const estado = calcularEstadoResultados(
      transacciones32(),
      categorias32(),
      simulaciones12(),
      50_000_000,
    )
    // Inicial:
    //   FCL mensual = -1,145,000 → anual = -13,740,000 (Excel J27).
    expect(
      estado.inicial.fcl_anual.equals(estado.inicial.flujo_caja_libre.mul(12)),
    ).toBe(true)
    expect(estado.inicial.fcl_anual.equals(new Decimal(-1_374_000_000))).toBe(true)

    // FA2 anual inicial = -1,145,000 × 12 = -13,740,000.
    expect(
      estado.inicial.fa2_anual.equals(estado.inicial.flujo_ahorro_2.mul(12)),
    ).toBe(true)

    // Cap_inv anual inicial = -1,145,000 × 12 = -13,740,000.
    expect(
      estado.inicial.cap_inv_anual.equals(estado.inicial.capacidad_inversion.mul(12)),
    ).toBe(true)

    // Mejorado:
    //   FCL mensual = 925,000 → anual = 11,100,000.
    expect(
      estado.mejorado.fcl_anual.equals(estado.mejorado.flujo_caja_libre.mul(12)),
    ).toBe(true)
    expect(estado.mejorado.fcl_anual.equals(new Decimal(1_110_000_000))).toBe(true)

    // Cap_inv anual mejorado = 925,000 × 12 = 11,100,000.
    expect(
      estado.mejorado.cap_inv_anual.equals(estado.mejorado.capacidad_inversion.mul(12)),
    ).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Tests — funciones granulares `calcularLadoInicial` y
// `calcularLadoMejorado` (las exporta el IMPL para que la UI las pueda
// consumir sin pagar el costo de calcular las dos a la vez).
// ---------------------------------------------------------------------------

describe('REQ-501: funciones granulares', () => {
  it('req_501_calcularLadoInicial_retorna_solo_inicial', () => {
    const lado = calcularLadoInicial(transacciones32(), categorias32())
    expect(lado.total_ingresos.equals(new Decimal(720_000_000))).toBe(true)
    expect(lado.flujo_ahorro_1.equals(new Decimal(214_000_000))).toBe(true)
    expect(lado.salario_personal_objetivo).toBeNull()
  })

  it('req_501_calcularLadoMejorado_aplica_simulaciones_y_salario', () => {
    const lado = calcularLadoMejorado(
      transacciones32(),
      categorias32(),
      simulaciones12(),
      50_000_000,
    )
    expect(lado.total_gastos.equals(new Decimal(627_500_000))).toBe(true)
    expect(lado.capacidad_inversion.equals(new Decimal(92_500_000))).toBe(true)
    expect(lado.salario_personal_objetivo!.equals(new Decimal(50_000_000))).toBe(true)
  })
})