// Tests for REQ-401: filter of non-essential expenses.
//
// Spec:    openspec/changes/mvp-financiero-local-first/spec.md §REQ-401
// Design:  openspec/changes/mvp-financiero-local-first/design.md §10.1
//          (filtro aislante), §10.4 (left join materialization).
// Tasks:   T-401.
// Test #:  slice 5 / frontend / REQ-401 (5 tests).
//
// RED PHASE: this file imports from
// `src/domain/simulador/filtro`, which does NOT exist yet. `pnpm test`
// MUST fail at the import-resolution step — that's the expected RED
// state. The IMPL phase will introduce the module exporting
// `esGastoNoEsencial` and `filtrarGastosNoEsenciales`.
//
// Pin of signatures for the IMPL phase (from the user's prompt — binding):
//
//   export function esGastoNoEsencial(t: Transaccion): boolean
//   export function filtrarGastosNoEsenciales(transacciones: Transaccion[]): Transaccion[]
//
// The functions are pure: they receive a `Transaccion` and return a
// boolean / filtered array. No DB access, no React, no Tauri.
//
// Behavioral contract (from REQ-401 and the Excel source):
//   * Gasto with `naturaleza_necesidad = 'No necesario'` ⇒ INCLUIDO.
//   * Gasto with `naturaleza_necesidad = 'No tan necesario'` ⇒ INCLUIDO.
//   * Gasto with `naturaleza_necesidad = 'Necesario'` ⇒ EXCLUIDO.
//   * Ingreso (regardless of `naturaleza_necesidad`) ⇒ EXCLUIDO.
//   * The filter preserves the input order; it does NOT mutate the input.

import { describe, it, expect } from 'vitest'
import { esGastoNoEsencial, filtrarGastosNoEsenciales } from '../filtro'
import type { TransaccionMin } from '../../agregaciones'

// ---------------------------------------------------------------------------
// Helpers: tiny factories so each test states only what's relevant.
// ---------------------------------------------------------------------------

/**
 * Minimal Transaccion fixture for the filtro tests. Defaults to a
 * "Gasto Necesario Mensual" baseline so any test that wants a different
 * shape just overrides the fields it cares about.
 */
function transaccion(partial: Partial<TransaccionMin>): TransaccionMin {
  return {
    tipo_flujo: 'Gasto',
    categoria_id: 1,
    frecuencia: 'Mensual',
    valor_centavos: 100_000,
    naturaleza_necesidad: 'Necesario',
    ...partial,
  } as TransaccionMin
}

// ---------------------------------------------------------------------------
// esGastoNoEsencial — single-row predicate.
// ---------------------------------------------------------------------------

describe('REQ-401: esGastoNoEsencial', () => {
  it('req_401_filtro_incluye_No_necesario', () => {
    const t = transaccion({ naturaleza_necesidad: 'No necesario' })
    expect(esGastoNoEsencial(t)).toBe(true)
  })

  it('req_401_filtro_incluye_No_tan_necesario', () => {
    const t = transaccion({ naturaleza_necesidad: 'No tan necesario' })
    expect(esGastoNoEsencial(t)).toBe(true)
  })

  it('req_401_filtro_excluye_Necesario', () => {
    const t = transaccion({ naturaleza_necesidad: 'Necesario' })
    expect(esGastoNoEsencial(t)).toBe(false)
  })

  it('req_401_filtro_excluye_Ingreso', () => {
    // The cross-column CHECK guarantees naturaleza_necesidad IS NULL
    // for Ingreso, but we test defensively: even if naturaleza were
    // somehow populated on an Ingreso (data corruption), the filtro
    // must reject it because the user only simulates gastos.
    const t = transaccion({
      tipo_flujo: 'Ingreso',
      naturaleza_necesidad: undefined,
      comportamiento: 'Fijo',
    })
    expect(esGastoNoEsencial(t)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// filtrarGastosNoEsenciales — list-level filter.
// ---------------------------------------------------------------------------

describe('REQ-401: filtrarGastosNoEsenciales', () => {
  it('req_401_filtro_retorna_solo_no_esenciales', () => {
    const txs: TransaccionMin[] = [
      // Gastos NO esenciales — deben quedar
      transaccion({
        concepto: 'Restaurantes',
        naturaleza_necesidad: 'No necesario',
        valor_centavos: 60_000_000,
      }),
      transaccion({
        concepto: 'Streaming',
        naturaleza_necesidad: 'No tan necesario',
        valor_centavos: 12_000_000,
      }),
      // Gastos esenciales — NO deben quedar
      transaccion({
        concepto: 'Arriendo',
        naturaleza_necesidad: 'Necesario',
        valor_centavos: 170_000_000,
      }),
      transaccion({
        concepto: 'Mercado',
        naturaleza_necesidad: 'Necesario',
        valor_centavos: 50_000_000,
      }),
      // Ingreso — NO debe quedar (aun con naturaleza_necesidad poblada
      // hipotéticamente por bug upstream)
      transaccion({
        tipo_flujo: 'Ingreso',
        concepto: 'Salario',
        comportamiento: 'Fijo',
        naturaleza_necesidad: undefined,
        valor_centavos: 400_000_000,
      }),
    ]

    const filtered = filtrarGastosNoEsenciales(txs)

    expect(filtered).toHaveLength(2)
    expect(filtered.map((t) => t.concepto).sort()).toEqual(['Restaurantes', 'Streaming'])

    // Sanity: none of the excluded categorias slipped in.
    expect(filtered.some((t) => t.concepto === 'Arriendo')).toBe(false)
    expect(filtered.some((t) => t.concepto === 'Mercado')).toBe(false)
    expect(filtered.some((t) => t.tipo_flujo === 'Ingreso')).toBe(false)

    // Pure-function contract: input array NOT mutated.
    expect(txs).toHaveLength(5)
  })
})