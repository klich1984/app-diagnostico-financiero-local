// Tests for Slice 8 (post-MVP): ListaTransacciones organism.
//
// Spec:    `openspec/changes/mvp-financiero-local-first/spec.md` §REQ-202
//          (Scenario: "Eliminar transacción" — UI surfacing the list and
//          the delete button).
// Design:  `openspec/changes/mvp-financiero-local-first/design.md` §7
//          (Atomic Design: organisms compose molecules + atoms).
// Tasks:   T-801..T-806 (Slice 8 frontend list + delete wiring).
// Test #:  slice 8 / frontend / ListaTransacciones organism (6 tests).
//
// RED PHASE: this file imports `ListaTransacciones` from
// `../ListaTransacciones`, which does NOT exist yet. `pnpm test` MUST
// fail at the import-resolution step before any `it()` block runs. That
// is the expected RED state. The IMPL phase will introduce
// `src/components/organisms/ListaTransacciones.tsx` (atomic-design
// organism, per design §7.1) with the props pinned below.
//
// ## Pin of signatures for the IMPL phase (from the user's prompt — binding):
//
//   export interface ListaTransaccionesProps {
//     transacciones: TransaccionCompletaDto[]
//     cargando: boolean
//     onEliminar: (id: number) => void | Promise<void>
//   }
//
//   export function ListaTransacciones(
//     props: ListaTransaccionesProps,
//   ): JSX.Element
//
// ## Test selectors (data-testid contract)
//
// The component MUST expose the following `data-testid` attributes so the
// tests can find rows/buttons deterministically (Spanish text + multiple
// rows + i18n-able labels would make getByText/getByRole flaky across
// refactors):
//
//   * `data-testid="lista-transacciones"`       — root container
//   * `data-testid="lista-vacia"`              — empty-state message node
//   * `data-testid="lista-cargando"`           — loading-state message node
//   * `data-testid="fila-transaccion"`         — each row container
//   * `data-testid="eliminar-{id}"`            — each row's delete button
//
// The IMPL can ALSO render localized text (which the tests assert via
// `container.textContent` regex), but the data-testid attrs are the
// canonical machine-readable hooks for tests and e2e tooling.
//
// ## Test infrastructure note
//
// This project does NOT have `@testing-library/react` installed and the
// user's hard rule forbids adding new dependencies. We render with
// `react-dom/client` + `createRoot` + `act()` directly (same pattern as
// `src/components/molecules/__tests__/TransaccionForm.test.tsx`). The
// setup file at `src/__tests__/setup.ts` already enables
// `globalThis.IS_REACT_ACT_ENVIRONMENT = true`.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { ListaTransacciones } from '../ListaTransacciones'
import type { TransaccionCompletaDto } from '../../../data/tauri-commands'

// Sample fixture used across the tests. `valor_centavos = 60_000_000`
// formats via `formatCentavos` to the Spanish string `"600.000,00"`
// (1 peso = 100 centavos → 600_000_000 / 100 = 6_000_000 pesos; wait —
// `60_000_000` centavos = `600_000,00` pesos, which is `$600.000,00` in
// Spanish notation — six hundred thousand pesos with zero cents).
const sampleTx: TransaccionCompletaDto = {
  id: 1,
  usuario_id: 1,
  tipo_flujo: 'Gasto',
  categoria_id: 5,
  categoria_nombre: 'Alimentacion',
  concepto: 'Sueldo',
  frecuencia: 'Mensual',
  comportamiento: 'Fijo',
  naturaleza_necesidad: 'Necesario',
  valor_centavos: 60_000_000,
  created_at: 1_783_379_000,
  updated_at: 1_783_379_020,
}

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

/// Render helper. `onEliminar` defaults to a `vi.fn()` that resolves to
/// `undefined` so tests can either accept the default and inspect the
/// returned delete id (via the mock), or pass their own mock.
function render(
  transacciones: TransaccionCompletaDto[],
  cargando = false,
  onEliminar: (id: number) => void | Promise<void> = vi.fn(),
) {
  act(() => {
    root.render(
      <ListaTransacciones
        transacciones={transacciones}
        cargando={cargando}
        onEliminar={onEliminar}
      />,
    )
  })
}

describe('REQ-202 / Slice 8: ListaTransacciones organism', () => {
  // REQ-202 / UI: when there are NO transactions and we are NOT loading,
  // the organism MUST render an empty-state message that mentions the
  // idea of "no transactions". This is the contract the user sees on a
  // fresh-install / first-launch scenario.
  //
  // Given:  no transactions, `cargando = false`.
  // When:   the organism is rendered.
  // Then:   the empty-state message node is present AND its text matches
  //         `/no hay transacciones/i`.
  it('slice8_lista_transacciones_renders_empty_state_when_no_data', () => {
    render([], false)

    const empty = container.querySelector('[data-testid="lista-vacia"]')
    expect(empty).not.toBeNull()
    expect(empty?.textContent ?? '').toMatch(/no hay transacciones/i)
  })

  // REQ-202 / UI: when `cargando = true`, the organism MUST render a
  // loading-state message that mentions "loading transactions" so the
  // user has feedback while the IPC call is in flight.
  //
  // Given:  no transactions, `cargando = true`.
  // When:   the organism is rendered.
  // Then:   the loading-state message node is present AND its text matches
  //         `/cargando transacciones/i`.
  it('slice8_lista_transacciones_renders_loading_state', () => {
    render([], true)

    const loading = container.querySelector('[data-testid="lista-cargando"]')
    expect(loading).not.toBeNull()
    expect(loading?.textContent ?? '').toMatch(/cargando transacciones/i)
  })

  // REQ-202 / UI: the organism MUST render exactly one row container per
  // transaction. The implementation uses `data-testid="fila-transaccion"`
  // on each row's root node so the count is queryable deterministically.
  //
  // Given:  two transactions.
  // When:   the organism is rendered.
  // Then:   there are exactly 2 `fila-transaccion` nodes AND each
  //         transaction's `concepto` is visible to the user.
  it('slice8_lista_transacciones_renders_one_row_per_transaction', () => {
    render([
      sampleTx,
      { ...sampleTx, id: 2, concepto: 'Arriendo' },
    ])

    const rows = container.querySelectorAll('[data-testid="fila-transaccion"]')
    expect(rows.length).toBe(2)

    // Both conceptos must be visible — this proves the data flow from
    // props to the rendered DOM is working end-to-end.
    const text = container.textContent ?? ''
    expect(text).toContain('Sueldo')
    expect(text).toContain('Arriendo')
  })

  // REQ-601 / REQ-202 / UI: the `valor_centavos` MUST be rendered using
  // the project's `formatCentavos` helper (Spanish locale: dots as
  // thousands separator, comma as decimal). We use a value with non-zero
  // cents to also assert the decimal part is present.
  //
  // Given:  one transaction with `valor_centavos = 60_000_000`
  //        (== 600_000,00 pesos).
  // When:   the organism is rendered.
  // Then:   the rendered DOM contains the Spanish-locale string
  //         `"600.000,00"`.
  it('slice8_lista_transacciones_formats_valor_with_thousands_separator', () => {
    // 60_000_050 centavos = 600_000,50 pesos → "600.000,50"
    render([{ ...sampleTx, valor_centavos: 60_000_050 }])

    const text = container.textContent ?? ''
    expect(text).toContain('600.000,50')
  })

  // REQ-202 / UI: the organism MUST surface the `tipo_flujo` of each row
  // as a visible badge/label. For now we only assert the literal
  // `'Gasto'` is visible — the IMPL is free to colorize / wrap it in a
  // styled badge as long as the text is reachable to the user (and to
  // assistive tech).
  //
  // Given:  one transaction with `tipo_flujo = 'Gasto'`.
  // When:   the organism is rendered.
  // Then:   the string `'Gasto'` appears in the DOM.
  it('slice8_lista_transacciones_shows_tipo_flujo_badge', () => {
    render([sampleTx])

    const text = container.textContent ?? ''
    expect(text).toContain('Gasto')
  })

  // REQ-202 / UI + delete wiring: clicking the delete button for a row
  // MUST call `onEliminar` with that row's `id` (and only that id). The
  // App-level wiring (confirmation dialog + IPC) is layered on top of
  // this organism's contract — Slice 8 keeps the organism dumb so the
  // wiring can be tested at the App layer in a later slice if needed.
  //
  // Given:  one transaction with `id = 1` and a `vi.fn()` onEliminar
  //        that resolves to undefined.
  // When:   the user clicks the delete button (queried via
  //         `[data-testid="eliminar-1"]`).
  // Then:   `onEliminar` is called exactly once with `1`.
  it('slice8_lista_transacciones_calls_on_eliminar_with_row_id', async () => {
    const onEliminar = vi.fn().mockResolvedValue(undefined)
    render([sampleTx], false, onEliminar)

    const deleteBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="eliminar-1"]',
    )
    expect(deleteBtn).not.toBeNull()
    expect(deleteBtn?.tagName).toBe('BUTTON')

    // Wrap the click in `act()` so React flushes the synthetic event
    // before we assert on the mock (jsdom + React 18 require this).
    await act(async () => {
      deleteBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onEliminar).toHaveBeenCalledTimes(1)
    expect(onEliminar).toHaveBeenCalledWith(1)
  })
})