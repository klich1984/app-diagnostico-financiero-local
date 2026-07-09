// Tests for the App-level integration: form reset after successful submit.
//
// ## Why this test exists
//
// The `TransaccionForm` molecule keeps its own internal state (concepto,
// valor, tipo, etc.) in `useState` hooks. Without an explicit reset
// signal from the parent, the form retains the just-saved values after a
// successful submit, which means the next entry starts pre-filled with
// the previous one — a UX bug.
//
// The fix lives in `App.tsx`: after a successful insert + refetch, the
// parent bumps a `formKey` counter and passes it as React's `key` prop
// to `TransaccionForm`. React remounts the form, throwing away all
// internal state, so the next entry starts fresh.
//
// ## Why this test belongs at the App level (not the form level)
//
// The reset is implemented at the PARENT level (the `key` lives in
// `App.tsx`). A pure `TransaccionForm` test cannot observe the reset
// because the molecule has no knowledge of its own remount — the parent
// is what forces it. Therefore the regression guard for this fix MUST
// be an integration test at the App level.
//
// ## What this test verifies (behavior, not implementation)
//
// We assert on the *behavior*: after a successful submit, the `concepto`
// input has `value === ''` (back to its initial state). We do NOT
// assert on `formKey`, on the `key` prop, or on any internal counter —
// those are implementation details that could change without affecting
// the user-visible behavior. If a future refactor swaps the `key`
// approach for a `ref` + `reset()` API, this test must still pass.
//
// ## Test infrastructure note
//
// This project does NOT have `@testing-library/react` installed (see
// `TransaccionForm.test.tsx` docblock). We render `App` via
// `react-dom/client` + `createRoot` + `act()` directly and query the
// resulting DOM with native `container.querySelector(...)`. We mock the
// Tauri `invoke` channel at the boundary (`@tauri-apps/api/core`) so
// `App` thinks it is talking to the Rust backend but actually talks to
// our `vi.fn()` queue. That matches the pattern already used by
// `src/data/__tests__/tauri-commands.test.ts`.
//
// `window.confirm` is stubbed to return `true` (auto-accept) — the
// reset path does NOT call confirm, but if a future regression makes
// the post-submit flow fall through to delete, the test would fail with
// a confusing "confirm is not a function" instead of the real failure.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'

// Mock `@tauri-apps/api/core` BEFORE importing `App`. Vitest hoists
// `vi.mock` calls to the top of the file regardless of source order,
// but keeping the mock adjacent to the import makes intent obvious.
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

import { invoke } from '@tauri-apps/api/core'
import App from '../App'

// Typed handle to the mocked `invoke`. Each call (categorias load,
// insert, list after insert, list on mount, ...) pops the next queued
// resolution. We use `mockResolvedValueOnce` chained per phase.
const invokeMock = invoke as unknown as ReturnType<typeof vi.fn>

let container: HTMLDivElement
let root: Root

/// Helper: locate the `concepto` text input by its `name` attribute
/// (the form uses `<input name="concepto">` — stable across refactors
/// of the surrounding markup).
function getConceptoInput(): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>('input[name="concepto"]')
  if (!input) throw new Error('App is missing the `concepto` input — has the form been removed?')
  return input
}

/// Helper: locate the `valor` text input.
function getValorInput(): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>('input[name="valor"]')
  if (!input) throw new Error('App is missing the `valor` input')
  return input
}

/// Helper: locate the submit button.
function getSubmitButton(): HTMLButtonElement {
  const button = container.querySelector<HTMLButtonElement>('button[type="submit"]')
  if (!button) throw new Error('App is missing the submit button')
  return button
}

/// Helper: type a value into a controlled text input using the React
/// native-setter trick (mirrors the helper in `TransaccionForm.test.tsx`).
/// We dispatch an `input` event so React's `onChange` fires and updates
/// the controlled component's internal state.
function typeInto(input: HTMLInputElement, raw: string): void {
  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  )?.set
  nativeSetter?.call(input, raw)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

beforeEach(() => {
  // Stub `window.confirm` so any unexpected delete path doesn't crash
  // with "confirm is not a function" — the reset path does not use it.
  vi.spyOn(window, 'confirm').mockReturnValue(true)

  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  // Reset the mock so call counts + queued resolutions don't leak
  // between tests.
  invokeMock.mockReset()
})

afterEach(() => {
  act(() => {
    root.unmount()
  })
  container.remove()
  vi.restoreAllMocks()
})

describe('App: form reset after successful submit', () => {
  // Behavior contract: after a successful insert + refetch, the form's
  // user-visible state goes back to its initial values, so the next
  // entry starts fresh.
  //
  // Given:  the app mounts with one categoria loaded from the backend.
  //         The user fills the form (concepto + valor) and clicks submit.
  // When:   the backend resolves `cmd_insert_transaccion` with a new id
  //         (success), and `cmd_listar_transacciones` resolves with the
  //         list (the post-insert refetch).
  // Then:   the `concepto` input is back to `''`, and the `valor` input
  //         is back to `''` (initial state of the molecule).
  //
  // This test fails in the BROKEN state (no `formKey` increment in
  // `App.tsx`) and passes after the fix lands.
  it('app_clears_form_inputs_after_successful_submit', async () => {
    // 1) Mount: queue the categorias load (called once on mount) and the
    //    initial transacciones list (called once on mount via the second
    //    `useEffect`). Use ONE Ingreso categoria so the form renders
    //    without depending on the default 'Gasto' subset being populated.
    invokeMock.mockResolvedValueOnce([
      { id: 1, nombre: 'Salario', grupo_pertenencia: 'Ingreso' },
    ])
    invokeMock.mockResolvedValueOnce([]) // initial listarTransacciones

    await act(async () => {
      root.render(<App />)
    })

    // 2) Switch the form to "Ingreso" so the categoria dropdown has at
    //    least one option (otherwise the categoria select has no items
    //    and the form still submits fine — but the test is more honest
    //    if it exercises a realistic flow). We can skip this: with the
    //    default 'Gasto' and an empty categorias subset, the form still
    //    accepts the input and submits. Leave the default 'Gasto'.
    //
    // 3) Fill the form: type a concepto and a valid valor.
    const conceptoInput = getConceptoInput()
    const valorInput = getValorInput()

    await act(async () => {
      typeInto(conceptoInput, 'Sueldo')
    })
    expect(conceptoInput.value).toBe('Sueldo')

    await act(async () => {
      typeInto(valorInput, '1500000,50')
    })
    expect(valorInput.value).toBe('1500000,50')

    // 4) Queue the post-submit IPC resolutions:
    //    - `cmd_insert_transaccion` → resolves with a new id (success)
    //    - `cmd_listar_transacciones` → resolves with the (empty) list
    //      (the refetch inside `handleSubmit` after a successful insert)
    invokeMock.mockResolvedValueOnce(42) // insertarTransaccion → 42
    invokeMock.mockResolvedValueOnce([]) // refetch listarTransacciones

    // 5) Click submit. The form's `onSubmit` is async (awaits the IPC);
    //    we wrap the click + the awaited microtasks in a single `act`
    //    so React flushes the state update that bumps `formKey` and
    //    remounts the form before we read `value` again.
    await act(async () => {
      getSubmitButton().click()
    })

    // 6) Behavior assertion: the form is back to its initial state.
    //    We re-query the input because React may have remounted the
    //    form node — the original `conceptoInput` reference might point
    //    to a detached DOM node. `getConceptoInput()` always reads from
    //    the current `container`.
    const conceptoAfter = getConceptoInput()
    const valorAfter = getValorInput()

    expect(conceptoAfter.value).toBe('')
    expect(valorAfter.value).toBe('')

    // 7) Strengthened: the IPC contract was honored. The Rust side was
    //    called with `cmd_insert_transaccion` and a `{ input }` payload.
    const insertCall = invokeMock.mock.calls.find(
      (c) => c[0] === 'cmd_insert_transaccion',
    )
    expect(insertCall).toBeDefined()
    expect(insertCall?.[1]).toHaveProperty('input')
    expect((insertCall?.[1] as { input: { concepto: string } }).input.concepto).toBe(
      'Sueldo',
    )

    // 8) And the success feedback is rendered (the "Guardado OK · id=42"
    //    line). This is a side-channel confirmation that we went through
    //    the success branch (not the error branch).
    expect(container.textContent ?? '').toMatch(/Guardado OK.*id=42/)
  })

  // Regression guard for the OPPOSITE behavior: if the form were NOT
  // reset, `conceptoAfter.value` would still be `'Sueldo'`. By spelling
  // out the "filled" precondition and the "empty" postcondition, this
  // test gives a clear failure message that points directly at the bug.
  //
  // This is the same scenario as above but with a tighter assertion on
  // just the `concepto` field, because that is the field most visible
  // to the user (the other fields are mostly numeric/select and harder
  // to spot accidentally pre-filled).
  it('app_does_not_retain_concepto_after_submit', async () => {
    invokeMock.mockResolvedValueOnce([
      { id: 1, nombre: 'Salario', grupo_pertenencia: 'Ingreso' },
    ])
    invokeMock.mockResolvedValueOnce([])

    await act(async () => {
      root.render(<App />)
    })

    const conceptoInput = getConceptoInput()
    const valorInput = getValorInput()

    await act(async () => {
      typeInto(conceptoInput, 'Sueldo anterior')
    })
    expect(conceptoInput.value).toBe('Sueldo anterior')

    // IMPORTANT: `valor` must also be filled, otherwise the form's own
    // validation rejects the submit before `onSubmit` is ever called —
    // the `parseAmount('')` path returns NaN and the form short-circuits.
    // Filling only `concepto` is not a valid submit scenario.
    await act(async () => {
      typeInto(valorInput, '500000')
    })

    invokeMock.mockResolvedValueOnce(99) // insert
    invokeMock.mockResolvedValueOnce([]) // refetch

    await act(async () => {
      getSubmitButton().click()
    })

    expect(getConceptoInput().value).toBe('')
  })

  // -------------------------------------------------------------------------
  // Slice 10 — Tab system (REQ-301, REQ-302)
  // -------------------------------------------------------------------------
  //
  // The App shell exposes two tabs at the top: "Transacciones" (the
  // current behavior of the page) and "Presupuesto" (the new Matriz
  // view). No React Router — local state with `useState<Tab>`. Both
  // tab buttons MUST be present in the DOM after mount so the user can
  // always navigate between the two views.
  //
  // These tests live at the App level (not at the MatrizPresupuesto
  // organism level) because the tab system is a shell-level concern:
  // it composes organisms, not the other way around.

  it('slice10_app_renders_tabs_for_transacciones_and_presupuesto', async () => {
    invokeMock.mockResolvedValueOnce([
      { id: 1, nombre: 'Salario', grupo_pertenencia: 'Ingreso' },
    ])
    invokeMock.mockResolvedValueOnce([]) // initial listarTransacciones
    invokeMock.mockResolvedValueOnce([]) // obtenerPerfiles (slice 9)

    await act(async () => {
      root.render(<App />)
    })

    // Find the two tab buttons by their visible labels. We use a
    // regex-tolerant match (case-insensitive) so the IMPL can change
    // capitalization without breaking the test.
    const tabTransacciones = container.querySelector<HTMLButtonElement>(
      'button[data-testid="tab-transacciones"]',
    )
    const tabPresupuesto = container.querySelector<HTMLButtonElement>(
      'button[data-testid="tab-presupuesto"]',
    )

    expect(tabTransacciones).not.toBeNull()
    expect(tabPresupuesto).not.toBeNull()
    expect(tabTransacciones?.textContent ?? '').toMatch(/transacciones/i)
    expect(tabPresupuesto?.textContent ?? '').toMatch(/presupuesto/i)
  })

  // Clicking the "Presupuesto" tab MUST surface the MatrizPresupuesto
  // container (`data-testid="matriz-presupuesto"`). This is the
  // contract that wires the organism into the App shell: the App holds
  // the tab state and conditionally renders the organism. We don't
  // assert on specific matrix numbers here — that is the organism's
  // contract, covered in `MatrizPresupuesto.test.tsx`.
  it('slice10_app_shows_matriz_container_when_presupuesto_tab_is_active', async () => {
    invokeMock.mockResolvedValueOnce([
      { id: 1, nombre: 'Salario', grupo_pertenencia: 'Ingreso' },
    ])
    invokeMock.mockResolvedValueOnce([]) // initial listarTransacciones
    invokeMock.mockResolvedValueOnce([]) // obtenerPerfiles (slice 9)

    await act(async () => {
      root.render(<App />)
    })

    // Sanity precondition: in the initial render the Matriz MUST NOT
    // be present (we land on the Transacciones tab by default).
    expect(
      container.querySelector('[data-testid="matriz-presupuesto"]'),
    ).toBeNull()

    // Click the Presupuesto tab. The IMPL uses a `<button>` so we can
    // trigger it with a native click event wrapped in `act()`.
    const tabPresupuesto = container.querySelector<HTMLButtonElement>(
      'button[data-testid="tab-presupuesto"]',
    )
    expect(tabPresupuesto).not.toBeNull()

    await act(async () => {
      tabPresupuesto?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    // Postcondition: the Matriz container is now in the DOM.
    expect(
      container.querySelector('[data-testid="matriz-presupuesto"]'),
    ).not.toBeNull()
  })
})