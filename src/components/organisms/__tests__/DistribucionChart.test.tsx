// Tests for Slice 13 (TDD RED): DistribucionChart organism.
//
// Spec:    `openspec/changes/mvp-financiero-local-first/spec.md` §REQ-302
//          (Gráficos de distribución porcentual — Recharts).
// Design:  `openspec/changes/mvp-financiero-local-first/design.md` §1
//          (arquitectura, capa React con Recharts) + §7 (Atomic Design —
//          `DistribucionChart` es un organism porque compone atoms de UI
//          con un molecule de chart library externo).
// Tasks:   T-302..T-303 (Slice 13 del roadmap post-MVP, HU-302).
// Test #:  slice 13 / frontend / DistribucionChart organism (4 tests).
//
// RED PHASE: this file imports `DistribucionChart` from
// `../DistribucionChart`, which does NOT exist yet. `pnpm test` MUST
// fail at the import-resolution step before any `it()` block runs. That
// is the expected RED state. The IMPL phase will introduce
// `src/components/organisms/DistribucionChart.tsx` with the props pinned
// below.
//
// ## Pin of signatures for the IMPL phase (binding):
//
//   import type { DistribucionPorcentual } from
//     '../../../domain/agregaciones/graficos'
//
//   export interface DistribucionChartProps {
//     distribucion: DistribucionPorcentual[]
//     titulo: string
//   }
//
//   export function DistribucionChart(
//     props: DistribucionChartProps,
//   ): JSX.Element
//
// ## Test selectors (data-testid contract)
//
// The component MUST expose the following `data-testid` attribute so the
// tests can find the root container deterministically (Spanish text +
// chart library internals + i18n-able labels would make any other hook
// flaky across refactors or Recharts upgrades):
//
//   * `data-testid="distribucion-chart"` — root container of the chart
//
// Recharts internal `path.recharts-sector` selector is ALSO part of the
// public contract because it is the official hook Recharts documents
// for testing the PieChart sector count. The IMPL phase MUST NOT
// rename that class — if Recharts changes it, the test will fail and
// we'll add a maintainer note.
//
// ## Test infrastructure note
//
// This project does NOT have `@testing-library/react` installed and the
// user's hard rule forbids adding new dependencies. We render with
// `react-dom/client` + `createRoot` + `act()` directly (same pattern as
// `src/components/organisms/__tests__/MatrizPresupuesto.test.tsx`).
// The setup file at `src/__tests__/setup.ts` already enables
// `globalThis.IS_REACT_ACT_ENVIRONMENT = true`.
//
// REcharts is NOT yet installed at the time of this RED phase. The IMPL
// phase will `pnpm add recharts` and then the import-resolution above
// will resolve successfully. Until then, the test fails at the import
// step — which IS the RED state we want.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { DistribucionChart } from '../DistribucionChart'
import { Decimal } from '../../../domain/precision/money'
import type { DistribucionPorcentual } from '../../../domain/agregaciones/graficos'

// Sample fixture: three categorias mixtas (con porcentajes ya
// pre-calculados, como las funciones de `domain/agregaciones/graficos`
// emiten). Los valores en centavos y los porcentajes son solo
// representativos — el contrato del componente es:
//   - titulo aparece en el DOM,
//   - un segmento por item (Recharts emite `path.recharts-sector` por
//     cada porción del PieChart),
//   - estado vacío cuando la lista es vacía,
//   - data-testid estable para tooling externo.
//
// El cálculo del porcentaje es responsabilidad del dominio (no del
// organism) — el component es DUMB, consume datos ya calculados.
const sampleData: DistribucionPorcentual[] = [
  { label: 'Hogar', valor: new Decimal(1870000), porcentaje: 45.5 },
  { label: 'Alimentacion', valor: new Decimal(900000), porcentaje: 21.9 },
  { label: 'Otros', valor: new Decimal(1340000), porcentaje: 32.6 },
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

/// Render helper. Centralizes the `act()` wrap so each test can focus
/// on the assertion, not the React plumbing.
function render(
  distribucion: DistribucionPorcentual[],
  titulo: string,
): void {
  act(() => {
    root.render(
      <DistribucionChart distribucion={distribucion} titulo={titulo} />,
    )
  })
}

describe('REQ-302 / Slice 13: DistribucionChart organism', () => {
  // REQ-302 / UI: el organism MUST render the human-readable titulo
  // provided as a prop. Verificamos vía `textContent` (no nos
  // comprometemos con un selector estructural concreto — Recharts
  // introduce muchos divs anidados y un selector tipo h1 sería
  // over-specified). El regex tolerante acepta el titulo exacto o con
  // mínimos cambios de capitalización.
  //
  // Given:  una distribución no vacía con un titulo cualquiera.
  // When:   el organism es rendereado.
  // Then:   el texto rendereado contiene el titulo provisto.
  it('slice13_distribucion_chart_renders_titulo', () => {
    render(sampleData, 'Distribución de gastos')

    const text = container.textContent ?? ''
    expect(text).toContain('Distribución')
  })

  // REQ-302 / UI: el PieChart de Recharts emite un `path` con la clase
  // `recharts-sector` POR CADA porción. Es el hook oficial documentado
  // por Recharts (no es un detalle interno — es contrato público de su
  // API de testing). El organism MUST emitir tantos sectores como
  // items en `distribucion`. Si emite menos, faltan categorías; si
  // emite más, hay duplicación.
  //
  // Given:  una distribución de 3 items (Hogar, Alimentacion, Otros).
  // When:   el organism es rendereado.
  // Then:   el DOM contiene exactamente 3 elementos
  //         `path.recharts-sector`.
  it('slice13_distribucion_chart_renders_one_segment_per_item', () => {
    render(sampleData, 'Test')

    const paths = container.querySelectorAll('path.recharts-sector')
    expect(paths.length).toBe(sampleData.length)
  })

  // REQ-302 / UI (empty state): cuando NO hay transacciones del tipo
  // pedido (ingresos o gastos), la distribución es `[]`. El organism
  // MUST mostrar un mensaje amigable en español, no un PieChart vacío
  // (Recharts con data=`[]` puede crashear o renderizar un placeholder
  // confuso). El texto exacto no se pinea — solo un regex
  // `/no hay datos/i` para tolerar variantes ("No hay datos", "no hay
  // datos para mostrar", etc.).
  //
  // Given:  una distribución vacía.
  // When:   el organism es rendereado.
  // Then:   el texto rendereado matchea `/no hay datos/i`.
  it('slice13_distribucion_chart_renders_empty_state', () => {
    render([], 'Test')

    const text = container.textContent ?? ''
    expect(text).toMatch(/no hay datos/i)
  })

  // REQ-302 / UI: el organism MUST exponer un `data-testid` estable en
  // el container raíz. Es el contrato para tooling externo (e2e,
  // tests de aceptación manuales, debugging) — sin él, los tests
  // quedan atados a paths de DOM internos de Recharts que cambian
  // entre versiones.
  //
  // Given:  cualquier distribución (no vacía para asegurar que el
  //         container es el del chart, no el de empty-state).
  // When:   el organism es rendereado.
  // Then:   existe un elemento con `data-testid="distribucion-chart"`
  //         en el DOM.
  it('slice13_distribucion_chart_exposes_data_testid', () => {
    render(sampleData, 'Test')

    expect(
      container.querySelector('[data-testid="distribucion-chart"]'),
    ).not.toBeNull()
  })
})
