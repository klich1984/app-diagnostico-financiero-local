// Tests for Slice 10 (TDD RED): MatrizPresupuesto organism.
//
// Spec:    `openspec/changes/mvp-financiero-local-first/spec.md` §REQ-301
//          (Matriz de agregacion por categoria y naturaleza).
// Design:  `openspec/changes/mvp-financiero-local-first/design.md` §10
//          (materializacion del join + SUMIFS) + §7 (Atomic Design).
// Tasks:   T-301..T-304 (Slice 4 of the original PRD plan, re-scoped to
//          Slice 10 in the post-MVP roadmap).
// Test #:  slice 10 / frontend / MatrizPresupuesto organism (5 tests).
//
// RED PHASE: this file imports `MatrizPresupuesto` from
// `../MatrizPresupuesto`, which does NOT exist yet. `pnpm test` MUST
// fail at the import-resolution step before any `it()` block runs. That
// is the expected RED state. The IMPL phase will introduce
// `src/components/organisms/MatrizPresupuesto.tsx` with the props pinned
// below.
//
// ## Pin of signatures for the IMPL phase (binding):
//
//   import type { MatrizPresupuesto as MatrizPresupuestoData } from
//     '../../../domain/agregaciones/matriz'
//
//   export interface MatrizPresupuestoProps {
//     matriz: MatrizPresupuestoData
//     cargando?: boolean
//   }
//
//   export function MatrizPresupuesto(
//     props: MatrizPresupuestoProps,
//   ): JSX.Element
//
// ## Test selectors (data-testid contract)
//
// The component MUST expose the following `data-testid` attributes so the
// tests can find rows/buttons deterministically (Spanish text + multiple
// rows + i18n-able labels would make getByText/getByRole flaky across
// refactors):
//
//   * `data-testid="matriz-presupuesto"`   — root container
//   * `data-testid="matriz-ingresos"`      — Ingresos table
//   * `data-testid="matriz-gastos"`        — Gastos table
//   * `data-testid="matriz-totales"`       — Totals footer
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
// `src/components/organisms/__tests__/ListaTransacciones.test.tsx`).
// The setup file at `src/__tests__/setup.ts` already enables
// `globalThis.IS_REACT_ACT_ENVIRONMENT = true`.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { MatrizPresupuesto } from '../MatrizPresupuesto'
import type {
  MatrizIngreso,
  MatrizGasto,
  MatrizPresupuesto as MatrizPresupuestoData,
} from '../../../domain/agregaciones/matriz'
import { Decimal } from '../../../domain/precision/money'

// Sample fixture: a non-empty matrix used across the "happy path" tests.
// The numbers are picked so that `totalIngresos` rounds nicely to
// `7.200.000,00` (Spanish locale via `formatCentavos`) and
// `totalGastos` to `2.770.000,00` — these are the exact strings the
// third test asserts on.
const sampleIngresos: MatrizIngreso[] = [
  {
    categoria: 'Salario',
    fijo: new Decimal(4_000_000_00),
    variable: new Decimal(0),
    total: new Decimal(4_000_000_00),
    totalAnual: new Decimal(48_000_000_00),
  },
  {
    categoria: 'Otros ingresos',
    fijo: new Decimal(0),
    variable: new Decimal(3_200_000_00),
    total: new Decimal(3_200_000_00),
    totalAnual: new Decimal(38_400_000_00),
  },
]

const sampleGastos: MatrizGasto[] = [
  {
    categoria: 'Hogar',
    necesario: new Decimal(1_870_000_00),
    noTanNecesario: new Decimal(0),
    noNecesario: new Decimal(0),
    total: new Decimal(1_870_000_00),
    totalAnual: new Decimal(22_440_000_00),
  },
  {
    categoria: 'Alimentacion',
    necesario: new Decimal(500_000_00),
    noTanNecesario: new Decimal(0),
    noNecesario: new Decimal(400_000_00),
    total: new Decimal(900_000_00),
    totalAnual: new Decimal(10_800_000_00),
  },
]

const sampleMatriz: MatrizPresupuestoData = {
  ingresos: sampleIngresos,
  gastos: sampleGastos,
  totalIngresos: new Decimal(7_200_000_00),
  totalIngresosAnual: new Decimal(86_400_000_00),
  totalGastos: new Decimal(2_770_000_00),
  totalGastosAnual: new Decimal(33_240_000_00),
  flujoCajaLibre: new Decimal(4_430_000_00),
  flujoCajaLibreAnual: new Decimal(53_160_000_00),
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

/// Render helper. Centralizes the `act()` wrap so each test can focus
/// on the assertion, not the React plumbing. `cargando` defaults to
/// `false`; the empty-state test sets it explicitly.
function render(
  matriz: MatrizPresupuestoData,
  cargando: boolean = false,
): void {
  act(() => {
    root.render(<MatrizPresupuesto matriz={matriz} cargando={cargando} />)
  })
}

describe('REQ-301 / Slice 10: MatrizPresupuesto organism', () => {
  // REQ-301 / UI: the organism MUST expose a section dedicated to the
  // Ingresos table and that section MUST contain the categoria name of
  // each ingreso bucket in the input. This proves the data flow from
  // props → render works end-to-end (it is NOT enough for the test to
  // confirm the section is present — the names must be there).
  //
  // Given:  a matrix with two Ingreso buckets ('Salario' + 'Otros
  //         ingresos').
  // When:   the organism is rendered.
  // Then:   the rendered text mentions BOTH categoria names.
  it('slice10_matriz_presupuesto_renders_ingresos_with_categoria_names', () => {
    render(sampleMatriz)

    const text = container.textContent ?? ''
    expect(text).toContain('Salario')
    expect(text).toContain('Otros ingresos')
  })

  // REQ-301 / UI: same as the previous test, but for Gastos. The
  // organism MUST show a dedicated section with each categoria name of
  // every gasto bucket.
  //
  // Given:  a matrix with two Gasto buckets ('Hogar' +
  //         'Alimentacion').
  // When:   the organism is rendered.
  // Then:   the rendered text mentions BOTH categoria names.
  it('slice10_matriz_presupuesto_renders_gastos_with_categoria_names', () => {
    render(sampleMatriz)

    const text = container.textContent ?? ''
    expect(text).toContain('Hogar')
    expect(text).toContain('Alimentacion')
  })

  // REQ-301 / UI: the organism MUST surface the aggregate totals
  // (totalIngresos, totalGastos) in Spanish-locale format
  // (formatCentavos: dots as thousands separator, comma as decimal,
  // trailing ",00" for the cents part). This is the user-visible
  // contract: a screenshot of the page MUST show these strings.
  //
  // Given:  a matrix where totalIngresos = 7_200_000_00 centavos
  //         (= 7.200.000,00 pesos) and totalGastos = 2_770_000_00
  //         centavos (= 2.770.000,00 pesos).
  // When:   the organism is rendered.
  // Then:   the rendered text contains BOTH Spanish-locale strings.
  it('slice10_matriz_presupuesto_renders_totales_in_spanish_locale', () => {
    render(sampleMatriz)

    const text = container.textContent ?? ''
    expect(text).toContain('7.200.000,00') // totalIngresos
    expect(text).toContain('2.770.000,00') // totalGastos
  })

  // REQ-301 / UI (empty state): when there are NO transacciones, the
  // matrix is empty (no buckets, zero totals). The organism MUST show
  // a friendly empty-state message so the user does not see a blank
  // page. The exact text is not pinned — only that some "no
  // transacciones" message is visible.
  //
  // Given:  an empty matrix (no ingresos, no gastos, all totals 0).
  // When:   the organism is rendered.
  // Then:   the rendered text matches `/no hay transacciones/i`.
  it('slice10_matriz_presupuesto_renders_empty_state_when_no_data', () => {
    const emptyMatriz: MatrizPresupuestoData = {
      ingresos: [],
      gastos: [],
      totalIngresos: new Decimal(0),
      totalIngresosAnual: new Decimal(0),
      totalGastos: new Decimal(0),
      totalGastosAnual: new Decimal(0),
      flujoCajaLibre: new Decimal(0),
      flujoCajaLibreAnual: new Decimal(0),
    }

    render(emptyMatriz)

    const text = container.textContent ?? ''
    expect(text).toMatch(/no hay transacciones/i)
  })

  // REQ-301 / UI: the organism MUST expose machine-readable hooks
  // (data-testid) on the three logical sections so future e2e tests
  // and other tooling can find them deterministically without relying
  // on the localized text. This is the same contract used by
  // `ListaTransacciones` (slice 8) and `SelectorPerfil` (slice 9).
  //
  // Given:  the matrix fixture with non-empty data.
  // When:   the organism is rendered.
  // Then:   the root container and the three section containers are
  //         all present in the DOM.
  it('slice10_matriz_presupuesto_exposes_data_testids', () => {
    render(sampleMatriz)

    expect(container.querySelector('[data-testid="matriz-ingresos"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="matriz-gastos"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="matriz-totales"]')).not.toBeNull()
  })
})
