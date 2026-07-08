// Tests for REQ-202: Transaction form (UI) validation.
//
// Spec:    openspec/changes/mvp-financiero-local-first/spec.md §REQ-202
//          (Scenario: "Formateo de input numérico" + invalid input).
// Design:  openspec/changes/mvp-financiero-local-first/design.md §7
//          (React layer / Atomic Design) and §1 (centavos rule).
// Tasks:   T-202 (slice 3).
// Test #:  slice 3 / frontend / REQ-202 (4 tests).
//
// RED PHASE: this file imports `TransaccionForm` from
// `../TransaccionForm`, which does NOT exist yet. `pnpm test` MUST fail
// at the import-resolution step before any `it()` block runs. That is the
// expected RED state. The IMPL phase will introduce
// `src/components/molecules/TransaccionForm.tsx` (atomic-design molecule,
// per design §7.1) with the props pinned below.
//
// Pin of signatures for the IMPL phase (from the user's prompt — binding):
//
//   type TipoFlujo = 'Ingreso' | 'Gasto'
//   type Frecuencia = 'Mensual' | 'Bimensual' | 'Trimestral' | 'Semestral' | 'Anual'
//
//   export interface TransaccionFormProps {
//     categorias: Array<{ id: number; nombre: string; tipo_flujo: TipoFlujo }>
//     onSubmit: (input: {
//       tipo_flujo: TipoFlujo
//       categoria_id: number
//       concepto: string
//       frecuencia: Frecuencia
//       valor_centavos: number  // already × 100 — see test #4
//     }) => void | Promise<void>
//   }
//
//   export function TransaccionForm(props: TransaccionFormProps): JSX.Element
//
// IMPORTANT: the form must convert the user-typed decimal value to INTEGER
// cents BEFORE calling `onSubmit`. That is the REQ-202 closed loop:
// "the system multiplies the value by 100 before persisting". The IMPL
// must use `toCentavos` from `../../domain/precision/money` (test #3).
//
// Test infrastructure note: this project does NOT have @testing-library
// installed and the user's hard rule #2 forbids adding new dependencies.
// We use ReactDOM directly with `createRoot` + jsdom to render and query
// the resulting DOM. This is intentionally minimal — once IMPL lands,
// these tests provide regression coverage for the validation surface.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { TransaccionForm, type TransaccionFormProps } from '../TransaccionForm'

// Minimal stub of the categories the form needs to render the dependent
// `categoria` select (REQ-201: dependent selects by tipo_flujo).
const stubCategorias: TransaccionFormProps['categorias'] = [
  { id: 1, nombre: 'Salario', tipo_flujo: 'Ingreso' },
  { id: 2, nombre: 'Hogar', tipo_flujo: 'Gasto' },
  { id: 3, nombre: 'Alimentacion', tipo_flujo: 'Gasto' },
]

// Tracks the last call to `onSubmit` so each test can inspect what the
// form would have sent to the store / IPC layer.
let lastSubmitted: unknown = null
const onSubmit = vi.fn((input) => {
  lastSubmitted = input
})

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  lastSubmitted = null
  onSubmit.mockClear()
})

afterEach(() => {
  act(() => {
    root.unmount()
  })
  container.remove()
})

/// Helper: render the form with the stub categorias + a mock onSubmit.
function renderForm() {
  act(() => {
    root.render(<TransaccionForm categorias={stubCategorias} onSubmit={onSubmit} />)
  })
}

/// Helper: fill the value input with the given raw string and dispatch
/// the change/input event so the form's onChange fires.
function typeValue(raw: string) {
  const valueInput = container.querySelector<HTMLInputElement>('input[name="valor"]')
  if (!valueInput) throw new Error('form is missing the `valor` input')
  act(() => {
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )?.set
    nativeSetter?.call(valueInput, raw)
    valueInput.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

/// Helper: fill the concepto input.
function typeConcepto(text: string) {
  const input = container.querySelector<HTMLInputElement>('input[name="concepto"]')
  if (!input) throw new Error('form is missing the `concepto` input')
  act(() => {
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )?.set
    nativeSetter?.call(input, text)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

/// Helper: click the submit button.
function clickSubmit() {
  const button = container.querySelector<HTMLButtonElement>('button[type="submit"]')
  if (!button) throw new Error('form is missing the submit button')
  act(() => {
    button.click()
  })
}

describe('REQ-202: TransaccionForm (validación de UI)', () => {
  // REQ-202 / Validation: empty concepto must block submit.
  // Given:  the user leaves the `concepto` field empty.
  // When:   the user clicks "Guardar".
  // Then:   the form does NOT call onSubmit and renders an inline error.
  it('req_202_form_rejects_empty_concepto', () => {
    renderForm()
    typeValue('1000000')
    clickSubmit()

    expect(onSubmit).not.toHaveBeenCalled()
    // Inline error visible (any selector — the IMPL decides the exact wording,
    // but the error must mention `concepto`).
    const errorText = container.textContent ?? ''
    expect(errorText.toLowerCase()).toMatch(/concepto/)
  })

  // REQ-202 / Validation: negative value must block submit.
  // Given:  the user types a negative number.
  // When:   the user clicks "Guardar".
  // Then:   onSubmit is not called and the form shows an error.
  it('req_202_form_rejects_negative_value', () => {
    renderForm()
    typeConcepto('Hogar')
    typeValue('-500000')
    clickSubmit()

    expect(onSubmit).not.toHaveBeenCalled()
    const errorText = container.textContent ?? ''
    expect(errorText.toLowerCase()).toMatch(/valor|negativ|cero|mayor/i)
  })

  // REQ-202 / Validation: zero must block submit (CHECK constraint in DB
  // already enforces this; the form is the first line of defense).
  // Given:  the user types "0".
  // When:   the user clicks "Guardar".
  // Then:   onSubmit is not called and an error is rendered.
  it('req_202_form_rejects_zero_value', () => {
    renderForm()
    typeConcepto('Hogar')
    typeValue('0')
    clickSubmit()

    expect(onSubmit).not.toHaveBeenCalled()
    const errorText = container.textContent ?? ''
    expect(errorText.toLowerCase()).toMatch(/valor|cero|mayor/i)
  })

  // REQ-202 / Closed loop: typed value "1.500.000,50" must arrive at
  // onSubmit as INTEGER centavos = 150000050.
  //
  // Given:  the user types "1.500.000,50" (Spanish-locale decimal).
  // When:   the form validates and submits.
  // Then:   onSubmit is called exactly once with `valor_centavos = 150000050`
  //         (the cents-form, after ×100). NO fractional part is leaked.
  it('req_202_form_calls_on_submit_with_centavos', () => {
    renderForm()
    typeConcepto('Hogar')
    typeValue('1.500.000,50')
    clickSubmit()

    expect(onSubmit).toHaveBeenCalledTimes(1)
    const arg = onSubmit.mock.calls[0]?.[0] as { valor_centavos: number } | undefined
    expect(arg).toBeDefined()
    expect(arg!.valor_centavos).toBe(150_000_050)
    expect(Number.isInteger(arg!.valor_centavos)).toBe(true)
  })
})

// Regression: REQ-202 FK violation on the second submit.
//
// Bug pattern: App.tsx forces a remount via `key={formKey}`. On remount,
// `categorias` arrives async via the IPC `obtenerCategorias()` call, so the
// component first mounts with `categorias=[]`. The lazy `useState`
// initializer in `TransaccionForm` runs only once with `[]` and stores
// `categoriaId=0`. Once categorias arrive, `categoriasFiltradas` updates
// but `categoriaId` stays at 0, so the next submit hits the FK constraint
// with `categoria_id=0`.
//
// Fix: a `useEffect` that syncs `categoriaId` whenever
// `categoriasFiltradas` changes and the current value is not in the set.
describe('REQ-202: TransaccionForm (sync de categoriaId tras remount)', () => {
  it('req_202_form_syncs_categoria_id_when_categorias_arrive_after_mount', () => {
    // 1. Mount with empty categorias (the App.tsx initial state, before
    //    `obtenerCategorias()` IPC roundtrip resolves).
    act(() => {
      root.render(<TransaccionForm categorias={[]} onSubmit={onSubmit} />)
    })

    // 2. Categorias arrive async (as App.tsx does after the IPC call).
    const categorias: TransaccionFormProps['categorias'] = [
      { id: 1, nombre: 'Salario', tipo_flujo: 'Ingreso' },
      { id: 5, nombre: 'Hogar', tipo_flujo: 'Gasto' },
      { id: 6, nombre: 'Transporte', tipo_flujo: 'Gasto' },
    ]
    act(() => {
      root.render(<TransaccionForm categorias={categorias} onSubmit={onSubmit} />)
    })

    // 3. User fills the form and submits. Default `tipoFlujo` is 'Gasto',
    //    so the first Gasto (id=5) must be picked — NOT 0.
    typeConcepto('Test sync')
    typeValue('1000000')
    clickSubmit()

    expect(onSubmit).toHaveBeenCalledTimes(1)
    const arg = onSubmit.mock.calls[0]?.[0] as { categoria_id: number } | undefined
    expect(arg).toBeDefined()
    expect(arg!.categoria_id).toBeGreaterThan(0)
    expect(arg!.categoria_id).toBe(5)
  })
})