// Tests for Slice B (TDD RED): PresupuestoMejoradoPanel organism.
//
// Spec:    `openspec/changes/mvp-cierre-modal-y-tab5/spec.md`
//          §REQ-403-D2-* y §REQ-605-D2-1
// Design:  `openspec/changes/mvp-cierre-modal-y-tab5/design.md` §3.3
// Tasks:   T-510 (RED tests).
// Test #:  9 scenarios mapped to this file.
//
// RED PHASE: This file imports `PresupuestoMejoradoPanel` which does NOT
// exist yet. The test run MUST fail at import resolution.
//
// IMPL phase pin:
//   export interface PresupuestoMejoradoPanelProps {
//     transacciones: TransaccionCompletaDto[]
//     categorias: CategoriaDto[]
//     simulaciones: SimulacionCompletaDto[]
//     onIrATransacciones: () => void
//   }

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { PresupuestoMejoradoPanel } from '../PresupuestoMejoradoPanel'
import type {
  TransaccionCompletaDto,
  CategoriaDto,
  SimulacionCompletaDto,
} from '../../../data/tauri-commands'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const catsMin: CategoriaDto[] = [
  { id: 1, nombre: 'Salario', grupo_pertenencia: 'Ingreso' },
  { id: 2, nombre: 'Hogar', grupo_pertenencia: 'Gasto' },
  { id: 3, nombre: 'Ocio', grupo_pertenencia: 'Gasto' },
]

// Golden fixture matching `matriz-mejorada.test.ts` to assert 6,275,000.00
const txsGolden: TransaccionCompletaDto[] = [
  {
    id: 1,
    usuario_id: 1,
    tipo_flujo: 'Gasto',
    categoria_id: 2,
    categoria_nombre: 'Hogar',
    concepto: 'Alquiler',
    frecuencia: 'Mensual',
    comportamiento: 'Fijo',
    naturaleza_necesidad: 'Necesario',
    valor_centavos: 5_000_000_00,
    created_at: 1,
    updated_at: 1,
  },
  {
    id: 2,
    usuario_id: 1,
    tipo_flujo: 'Gasto',
    categoria_id: 3,
    categoria_nombre: 'Ocio',
    concepto: 'Restaurante',
    frecuencia: 'Mensual',
    comportamiento: 'Variable',
    naturaleza_necesidad: 'No tan necesario',
    valor_centavos: 1_275_000_00, // original, simulator will override this
    created_at: 1,
    updated_at: 1,
  },
]

const simsGolden: SimulacionCompletaDto[] = [
  {
    id: 1,
    usuario_id: 1,
    transaccion_id: 2, // overriding Ocio
    nuevo_valor_centavos: 1_275_000_00, // This makes the Golden Total: 5M + 1.275M = 6,275,000.00
    created_at: 1,
    updated_at: 1,
  },
]

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => {
    root.unmount()
  })
  container.remove()
})

function render(
  transacciones: TransaccionCompletaDto[],
  categorias: CategoriaDto[],
  simulaciones: SimulacionCompletaDto[],
  onIrATransacciones: () => void = vi.fn(),
): void {
  act(() => {
    root.render(
      <PresupuestoMejoradoPanel
        transacciones={transacciones}
        categorias={categorias}
        simulaciones={simulaciones}
        onIrATransacciones={onIrATransacciones}
      />,
    )
  })
}

describe('REQ-403-D2 / Slice B: PresupuestoMejoradoPanel organism', () => {
  // REQ-403-D2-4: Empty state sin transacciones
  it('sliceB_renders_empty_state_when_no_transactions', () => {
    const onIr = vi.fn()
    render([], catsMin, [], onIr)

    const text = container.textContent ?? ''
    expect(text).toContain('No hay transacciones registradas')

    const btn = container.querySelector('[data-testid="btn-ir-transacciones"]') as HTMLButtonElement
    expect(btn).not.toBeNull()

    act(() => {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onIr).toHaveBeenCalledTimes(1)
  })

  // REQ-403-D2-3: Banner cuando no hay simulaciones
  it('sliceB_renders_banner_when_no_simulations', () => {
    render(txsGolden, catsMin, []) // no sims

    const text = container.textContent ?? ''
    expect(text).toContain('Sin mejoras aplicadas')
    expect(container.querySelector('[data-testid="banner-sin-simulaciones"]')).not.toBeNull()
  })

  // REQ-403-D2-2: Renderizado de matriz mejorada (sin banner si hay sims)
  it('sliceB_renders_matriz_mejorada_without_banner_when_sims_exist', () => {
    render(txsGolden, catsMin, simsGolden)

    const text = container.textContent ?? ''
    expect(text).not.toContain('Sin mejoras aplicadas')
    expect(container.querySelector('[data-testid="banner-sin-simulaciones"]')).toBeNull()
    expect(container.querySelector('[data-testid="matriz-gastos"]')).not.toBeNull()
  })

  // REQ-403-D2-5 & REQ-605-D2-1: KPI Total Gastos Mejorado con golden value
  it('sliceB_renders_golden_value_for_total_gastos', () => {
    render(txsGolden, catsMin, simsGolden)

    const text = container.textContent ?? ''
    expect(text).toContain('6.275.000,00')
    expect(container.querySelector('[data-testid="kpi-total-gastos-mejorado"]')).not.toBeNull()
  })

  // REQ-403-D2-7: Simulaciones huérfanas ignoradas
  it('sliceB_ignores_orphan_simulations_without_crashing', () => {
    const orphanSims: SimulacionCompletaDto[] = [
      ...simsGolden,
      {
        id: 99,
        usuario_id: 1,
        transaccion_id: 999,
        nuevo_valor_centavos: 0,
        created_at: 1,
        updated_at: 1,
      },
    ]

    expect(() => {
      render(txsGolden, catsMin, orphanSims)
    }).not.toThrow()

    const text = container.textContent ?? ''
    expect(text).toContain('6.275.000,00') // Golden value remains unchanged
  })

  // Note: App.tsx routing tests (REQ-403-D2-1, REQ-403-D2-6, REQ-403-D2-8)
  // can be asserted via simple presence of elements in this component's DOM
  // or are relegated to App.tsx test. For this panel's scope, we test the organism UI.
})
