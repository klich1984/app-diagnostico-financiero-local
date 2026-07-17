// Tests for Slice 11 + Slice 12 (TDD): SimuladorPanel organism.
//
// Spec:    `openspec/changes/mvp-financiero-local-first/spec.md` §REQ-602
//          (Simulador commands) + §REQ-603 (panel UI support) +
//          §REQ-402 (Recálculo en tiempo real con persistencia).
// Design:  `openspec/changes/mvp-financiero-local-first/design.md` §10
//          (matriz mejorada) + §11 (Panel Simulador).
// Tasks:   T-401..T-403 (Simulador UI — third tab alongside
//          Transacciones and Presupuesto).
// Test #:  slice 11 + slice 12 / frontend / SimuladorPanel organism
//          (7 tests: 3 from slice 11 + 4 NEW from slice 12).
//
// Slice 12 evolves REQ-402: the slice 11 debounced auto-save is
// REPLACED by an explicit "Aplicar" button per row. `onUpsert` MUST
// fire ONLY when the user clicks the button. The IMPL phase will
// (a) remove the debounce wiring from the input `onChange`,
// (b) render `<button data-testid="aplicar-{id}">` per row,
// (c) toggle `disabled` based on whether the typed value matches the
//     persisted value.
//
// RED PHASE (slice 12): the 4 new tests in this file MUST fail because
// `data-testid="aplicar-{id}"` does NOT exist yet in
// `src/components/organisms/SimuladorPanel.tsx`. The 3 slice 11 tests
// (renders / does-not-render-Necesario / empty-state) MUST still
// PASS — they validate the static structure of the organism, which
// the slice 12 refactor preserves.
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
//   * `data-testid="aplicar-{id}"`           — slice 12: Aplicar button
//                                              per row (REQ-402 manual
//                                              commit — replaces the
//                                              old 300 ms debounce)
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

  // ===========================================================================
  // Slice 12 — Aplicar button per row (REQ-402 evolution)
  // ===========================================================================
  //
  // Context: the original slice 11 implementation auto-fired `onUpsert`
  // via a 300 ms debounce on every keystroke. The user rejected that
  // behaviour because it produced surprising DB writes while the user
  // was mid-edit. The new contract is: there is ONE explicit "Aplicar"
  // button per row, and `onUpsert` MUST fire ONLY when the user clicks
  // it. This block codifies that contract as 4 RED tests.
  //
  // The IMPL must:
  //   * remove `createDebouncedCallback` from `SimuladorPanel.tsx`,
  //   * remove the `debouncedUpsert.call(...)` inside the input
  //     `onChange`,
  //   * render a `<button data-testid="aplicar-{transaccionId}">`
  //     beside each row's input,
  //   * keep the input CONTROLLED (the typed string stays in local
  //     state until the user clicks Aplicar),
  //   * disable the button when the typed value matches the persisted
  //     value (i.e. there's nothing new to commit), and re-enable it as
  //     soon as the user diverges from the persisted value.
  //
  // Spanish UI text is allowed (and expected — see locked decision
  // #1: idioma UI español neutro) but the data-testid contract is the
  // canonical machine-readable hook, so we assert on that.

  // REQ-402 (slice 12 / UI, disabled state): when the user has NOT
  // typed anything yet, the local input value is whatever the
  // component formatted from the persisted value. The Aplicar button
  // MUST be `disabled` because there's no diff to commit.
  //
  // Given:  the panel renders the sample fixture (id=1 No-tan-necesario).
  // When:   the user has not interacted with the input.
  // Then:   `[data-testid="aplicar-1"]` exists and has `disabled=true`.
  it('REQ-402: Aplicar button is disabled when input matches persisted value', () => {
    render(sampleTransacciones)

    const button = container.querySelector<HTMLButtonElement>(
      '[data-testid="aplicar-1"]',
    )
    expect(button).not.toBeNull()
    if (!button) throw new Error('aplicar-1 not present in the DOM')
    expect(button.disabled).toBe(true)
  })

  // REQ-402 (slice 12 / UI, enabled state): the moment the typed
  // value diverges from the persisted value, the Aplicar button MUST
  // become enabled. The user can then click it to commit the change.
  //
  // Given:  the panel renders the sample fixture.
  // When:   the user types `50000` (PESOS) into the input for id=1
  //         (different from the persisted 150.000 centavos formatted
  //         as "1.500" pesos).
  // Then:   `[data-testid="aplicar-1"]` is NOT disabled.
  it('REQ-402: Aplicar button is enabled when input differs from persisted value', async () => {
    render(sampleTransacciones)

    const input = container.querySelector<HTMLInputElement>(
      '[data-testid="simulador-input-1"]',
    )
    expect(input).not.toBeNull()
    if (!input) throw new Error('simulador-input-1 not present in the DOM')

    // Controlled-input update: dispatch `input` (React listens to
    // `input`, not `change` for onChange in React 17+).
    await act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set
      nativeSetter?.call(input, '50000')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const button = container.querySelector<HTMLButtonElement>(
      '[data-testid="aplicar-1"]',
    )
    expect(button).not.toBeNull()
    if (!button) throw new Error('aplicar-1 not present in the DOM')
    expect(button.disabled).toBe(false)
  })

  // REQ-402 (slice 12 / UI, click commits the value): clicking the
  // Aplicar button MUST call `onUpsert` exactly once with the typed
  // value converted PESOS → CENTAVOS (×100). PESOS interpretation is
  // preserved from slice 11 to keep the UI consistent with what the
  // user typed.
  //
  // Given:  one No-tan-necesario transaction (id=1) + a `vi.fn()`
  //         resolving for `onUpsert`.
  // When:   the user types `50000` PESOS into the input for id=1
  //         AND clicks `[data-testid="aplicar-1"]`.
  // Then:   `onUpsert` is called with
  //         `{ transaccionId: 1, nuevoValorCentavos: 5_000_000,
  //         usuarioId: 1 }` (50.000 pesos = 5.000.000 centavos).
  it('REQ-402: Aplicar button click calls onUpsert with the typed value', async () => {
    const onUpsert = vi.fn().mockResolvedValue(undefined)
    render(sampleTransacciones, { onUpsert })

    const input = container.querySelector<HTMLInputElement>(
      '[data-testid="simulador-input-1"]',
    )
    expect(input).not.toBeNull()
    if (!input) throw new Error('simulador-input-1 not present in the DOM')

    await act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set
      nativeSetter?.call(input, '50000')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const button = container.querySelector<HTMLButtonElement>(
      '[data-testid="aplicar-1"]',
    )
    expect(button).not.toBeNull()
    if (!button) throw new Error('aplicar-1 not present in the DOM')

    await act(async () => {
      button.click()
    })

    expect(onUpsert).toHaveBeenCalledTimes(1)
    expect(onUpsert).toHaveBeenCalledWith({
      transaccionId: 1,
      // 50.000 pesos = 5.000.000 centavos (PESOS → CENTAVOS ×100)
      nuevoValorCentavos: 5_000_000,
      usuarioId: 1,
    })
  })

  // REQ-402 (slice 12 / UI, NO auto-fire): the slice 11 debounce must
  // be GONE. Typing into the input alone MUST NOT trigger `onUpsert`,
  // no matter how long the user waits. Only the explicit click on the
  // Aplicar button may call `onUpsert`.
  //
  // Given:  the panel renders the sample fixture + a spy `onUpsert`.
  // When:   the user types `50000` into the input and waits 500 ms
  //         (well beyond the old 300 ms debounce window) WITHOUT
  //         clicking anything.
  // Then:   `onUpsert` has NOT been called.
  it('REQ-402: Aplicar button does NOT auto-fire on input change (no debounce)', async () => {
    const onUpsert = vi.fn().mockResolvedValue(undefined)
    render(sampleTransacciones, { onUpsert })

    const input = container.querySelector<HTMLInputElement>(
      '[data-testid="simulador-input-1"]',
    )
    expect(input).not.toBeNull()
    if (!input) throw new Error('simulador-input-1 not present in the DOM')

    await act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set
      nativeSetter?.call(input, '50000')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })

    // > 500ms to fully cover the legacy debounce window (300ms) and
    // give React's commit cycle room to flush any lingering effect.
    await new Promise((resolve) => setTimeout(resolve, 500))

    expect(onUpsert).not.toHaveBeenCalled()
  })
})
