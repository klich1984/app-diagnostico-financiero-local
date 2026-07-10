// Tests for Slice 11 (TDD RED): SimuladorPanel organism.
//
// Spec:    `openspec/changes/mvp-financiero-local-first/spec.md` §REQ-602
//          (Simulador commands) + §REQ-603 (panel UI support).
// Design:  `openspec/changes/mvp-financiero-local-first/design.md` §10
//          (matriz mejorada) + §11 (Panel Simulador).
// Tasks:   T-401..T-403 (Simulador UI — third tab alongside
//          Transacciones and Presupuesto).
// Test #:  slice 11 / frontend / SimuladorPanel organism (4 tests).
//
// RED PHASE: this file imports `SimuladorPanel` from
// `../SimuladorPanel`, which does NOT exist yet. `pnpm test` MUST fail
// at the import-resolution step before any `it()` block runs. That is
// the expected RED state. The IMPL phase will introduce
// `src/components/organisms/SimuladorPanel.tsx` (atomic-design organism,
// per design §7.1) with the props pinned below.
//
// ## Pin of signatures for the IMPL phase (from the user's prompt — binding):
//
//   export interface SimuladorPanelProps {
//     transacciones: TransaccionCompletaDto[]
//     categorias: CategoriaDto[]
//     simulaciones: SimulacionCompletaDto[]
//     onUpsert: (input: UpsertSimulacionInput) => void | Promise<void>
//     onEliminar: (transaccionId: number) => void | Promise<void>
//     cargando?: boolean
//   }
//
//   export function SimuladorPanel(
//     props: SimuladorPanelProps,
//   ): JSX.Element
//
// ## Test selectors (data-testid contract)
//
// The component MUST expose the following `data-testid` attributes so
// the tests can find rows/inputs deterministically (Spanish text +
// multiple rows + i18n-able labels would make getByText/getByRole
// flaky across refactors):
//
//   * `data-testid="simulador-panel"`        — root container
//   * `data-testid="simulador-input-{id}"`   — input for transaccion {id}
//   * `data-testid="simulador-vacio"`        — empty-state placeholder
//
// The IMPL can ALSO render localized text (which the tests assert via
// `container.textContent` regex), but the data-testid attrs are the
// canonical machine-readable hooks for tests and e2e tooling.
//
// ## Filename anchoring
//
// The fixture `sampleTransacciones` reuses the slice 7 type
// `TransaccionCompletaDto` verbatim — `naturaleza_necesidad` and
// `comportamiento` are nullable per the database schema (see
// `migrations/001_inicial.sql`). The component is expected to use
// `domain/simulador/filtro.ts` (§10.1 of the design) to drop Necesario
// filas before rendering.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { SimuladorPanel } from '../SimuladorPanel'
import type {
  CategoriaDto,
  SimulacionCompletaDto,
  TransaccionCompletaDto,
} from '../../../data/tauri-commands'

// Sample fixtures: one No-tan-necesario gasto (simulable) + one
// Necesario gasto (NOT simulable). The simulator panel MUST surface
// only the simulable rows.
const sampleTransacciones: TransaccionCompletaDto[] = [
  {
    id: 1,
    usuario_id: 1,
    tipo_flujo: 'Gasto',
    categoria_id: 5,
    categoria_nombre: 'Alimentacion',
    concepto: 'Cafe premium',
    frecuencia: 'Mensual',
    comportamiento: 'Fijo',
    naturaleza_necesidad: 'No tan necesario',
    valor_centavos: 150_000,
    created_at: 1,
    updated_at: 1,
  },
  {
    id: 2,
    usuario_id: 1,
    tipo_flujo: 'Gasto',
    categoria_id: 6,
    categoria_nombre: 'Hogar',
    concepto: 'Arriendo',
    frecuencia: 'Mensual',
    comportamiento: 'Fijo',
    naturaleza_necesidad: 'Necesario',
    valor_centavos: 1_700_000,
    created_at: 1,
    updated_at: 1,
  },
]

const sampleCategorias: CategoriaDto[] = [
  { id: 5, nombre: 'Alimentacion', grupo_pertenencia: 'Gasto' },
  { id: 6, nombre: 'Hogar', grupo_pertenencia: 'Gasto' },
]

const sampleSimulaciones: SimulacionCompletaDto[] = []

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

/**
 * Render helper. Centralizes the `act()` wrap so each test can focus
 * on the assertion, not the React plumbing. `cargando` and the
 * callbacks default to no-ops so tests can pass them selectively.
 */
function render(
  transacciones: TransaccionCompletaDto[],
  opciones: {
    categorias?: CategoriaDto[]
    simulaciones?: SimulacionCompletaDto[]
    onUpsert?: (input: {
      transaccionId: number
      nuevoValorCentavos: number
      usuarioId: number
    }) => void | Promise<void>
    onEliminar?: (transaccionId: number) => void | Promise<void>
    cargando?: boolean
  } = {},
): void {
  const {
    categorias = sampleCategorias,
    simulaciones = sampleSimulaciones,
    onUpsert = vi.fn(),
    onEliminar = vi.fn(),
    cargando = false,
  } = opciones

  act(() => {
    root.render(
      <SimuladorPanel
        transacciones={transacciones}
        categorias={categorias}
        simulaciones={simulaciones}
        onUpsert={onUpsert}
        onEliminar={onEliminar}
        cargando={cargando}
      />,
    )
  })
}

describe('REQ-602 / Slice 11: SimuladorPanel organism', () => {
  // REQ-602 (slice 11 / UI, happy path): the organism MUST render one
  // row per non-essential gasto. For the slice 5+ sample fixture
  // (`Cafe premium`, naturaleza_necesidad = 'No tan necesario'), the
  // `concepto` MUST appear in the rendered DOM. This proves the data
  // flow from props → render works end-to-end.
  //
  // Given:  a list of transactions with at least one No-tan-necesario
  //         row ('Cafe premium').
  // When:   the organism is rendered.
  // Then:   the rendered text mentions `Cafe premium`.
  it('renders the list of non-essential gastos', () => {
    render(sampleTransacciones)

    const text = container.textContent ?? ''
    expect(text).toContain('Cafe premium')
  })

  // REQ-602 + REQ-401 (slice 11 / UI, filter contract): the organism
  // MUST NOT render gastos whose `naturaleza_necesidad` is 'Necesario'.
  // Per slice 5 + design §10.1, the simulator operates only on the
  // isolated universe of non-essential gastos; Necesario rows are out
  // of scope for slider interactions.
  //
  // Given:  a fixture with one No-tan-necesario ('Cafe premium') and
  //         one Necesario ('Arriendo') gasto.
  // When:   the organism is rendered.
  // Then:   'Arriendo' is NOT in the rendered text.
  it('does NOT render gastos that are Necesario (non-simulable)', () => {
    render(sampleTransacciones)

    const text = container.textContent ?? ''
    expect(text).not.toContain('Arriendo')
  })

  // REQ-602 (slice 11 / UI, empty state): when there are NO non-
  // essential gastos, the organism MUST render a friendly empty-state
  // message so the user does not see a blank panel.
  //
  // Given:  no transactions at all.
  // When:   the organism is rendered.
  // Then:   the rendered text matches `/no hay gastos no esenciales/i`.
  it('renders empty state when no non-essential gastos', () => {
    render([])

    const text = container.textContent ?? ''
    expect(text).toMatch(/no hay gastos no esenciales/i)
  })

  // REQ-602 (slice 11 / UI, debounced wiring): changing the input
  // for a non-essential gasto MUST schedule `onUpsert` to fire AFTER
  // the panel's debounce window has elapsed. This is the heart of
  // REQ-402 (debounce) + REQ-602 (panel): the input event triggers an
  // upsert with the new value, and the parent uses the callback to
  // hit the IPC.
  //
  // Given:  one No-tan-necesario transaction (id=1) + a `vi.fn()`
  //         resolving for `onUpsert`.
  // When:   the user types `50000` into the input for id=1
  //         (`data-testid="simulador-input-1"`).
  // Then:   after waiting > debounce window, `onUpsert` is called
  //         with `{ transaccionId: 1, nuevoValorCentavos: 50000,
  //         usuarioId: 1 }`.
  it('calls onUpsert when an input changes', async () => {
    const onUpsert = vi.fn().mockResolvedValue(undefined)
    render(sampleTransacciones, { onUpsert })

    const input = container.querySelector<HTMLInputElement>(
      '[data-testid="simulador-input-1"]',
    )
    expect(input).not.toBeNull()
    if (!input) throw new Error('simulador-input-1 not present in the DOM')

    // Real DOM input event — `act` ensures React flushes state before
    // we move on.
    await act(async () => {
      input.value = '50000'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })

    // > 300ms (slice 5's `createDebouncedCallback` default delay) to
    // cover the debounce window without relying on `vi.useFakeTimers`
    // (we use real timers here to mirror the production timing).
    await new Promise((resolve) => setTimeout(resolve, 400))

    expect(onUpsert).toHaveBeenCalled()
    expect(onUpsert).toHaveBeenCalledWith({
      transaccionId: 1,
      nuevoValorCentavos: 50_000,
      usuarioId: 1,
    })
  })
})
