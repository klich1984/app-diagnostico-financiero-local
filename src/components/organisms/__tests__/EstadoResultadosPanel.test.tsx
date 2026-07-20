// Tests for Slice 14 (TDD RED): EstadoResultadosPanel organism.
//
// Spec:    `openspec/changes/mvp-financiero-local-first/spec.md`
//          §REQ-501 (vista dual Inicial vs Mejorado) + §REQ-502
//          (Salario Personal Objetivo configurable) + §REQ-603
//          (multi-perfil, el panel debe leer el salario del perfil
//          activo y propagarlo a la columna Mejorado).
// Design:  `openspec/changes/mvp-financiero-local-first/design.md`
//          §9.1 (motor de cálculo de KPIs) + §10 (Panel Simulador) +
//          §17 (reglas de redondeo R-NUEVO-*).
// Tasks:   T-501, T-502, T-503 (HU-501/502, Slice 14 del roadmap
//          post-MVP, HU-501/502). El organism es la parte de UI del
//          T-501; el motor de cálculo está en `src/domain/kpis`.
// Test #:  slice 14 / frontend / EstadoResultadosPanel organism
//          (3 tests).
//
// RED PHASE: this file imports `EstadoResultadosPanel` from
// `../EstadoResultadosPanel`, which does NOT exist yet. `pnpm test`
// MUST fail at the import-resolution step before any `it()` block
// runs. That IS the expected RED state. The IMPL phase will introduce
// `src/components/organisms/EstadoResultadosPanel.tsx` with the props
// pinned below.
//
// ## Pin of signatures for the IMPL phase (binding):
//
//   import type { EstadoResultados } from '../../../domain/kpis'
//
//   export interface EstadoResultadosPanelProps {
//     estado: EstadoResultados
//     salarioObjetivoCentavos: number | null
//   }
//
//   export function EstadoResultadosPanel(
//     props: EstadoResultadosPanelProps,
//   ): JSX.Element
//
// ## Test selectors (data-testid contract)
//
// The component MUST expose the following `data-testid` attribute so
// the tests can find the root container deterministically:
//
//   * `data-testid="estado-resultados"` — root container of the panel
//
// ## Decisión de diseño del lado Inicial (binding)
//
// REQ-501 / decisión de producto bloqueada #2: el Salario Personal
// Objetivo NO se descuenta en el lado Inicial. El panel recibe
// `salarioObjetivoCentavos: number | null` y lo proyecta en la columna
// "Mejorado"; en la columna "Inicial" siempre muestra 0 o vacío para la
// línea "Salario Personal". Esto lo valida el Slice 6 contra el motor
// de cálculo (`LadoEstado.salario_personal_objetivo === null` en
// `calcularLadoInicial`) — el organism es DUMB y consume esa decisión
// ya tomada.
//
// ## Test infrastructure note
//
// This project does NOT have `@testing-library/react` installed and the
// user's hard rule forbids adding new dependencies. We render with
// `react-dom/client` + `createRoot` + `act()` directly (same pattern
// as `src/components/organisms/__tests__/MatrizPresupuesto.test.tsx`
// and `DistribucionChart.test.tsx`). The setup file at
// `src/__tests__/setup.ts` already enables
// `globalThis.IS_REACT_ACT_ENVIRONMENT = true`.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { EstadoResultadosPanel } from '../EstadoResultadosPanel'
import { Decimal } from '../../../domain/precision/money'
import type { EstadoResultados, LadoEstado } from '../../../domain/kpis'

// ---------------------------------------------------------------------------
// Sample fixtures.
// ---------------------------------------------------------------------------
//
// Los valores en centavos siguen el Golden Excel documentado en
// `src/domain/kpis/index.ts` §"Golden Excel (referencia)" + el
// detalle de fixture 32-transacciones de `src/tests/golden/`. Sólo
// cambiamos `flujo_caja_libre` del lado Mejorado a un valor distinto
// del Inicial para poder demostrar la columna Delta con un caso real
// (mejora del FCL cuando se aplican simulaciones).
//
// Las magnitudes:
//
//   - Ingresos mensuales:  $7,200,000  →  720_000_000 centavos
//   - Gastos totales:      $8,345,000  →  834_500_000 centavos
//   - FA1 (Inicial):       $2,140,000  →  214_000_000 centavos
//   - FA2 (Inicial):       -$1,145,000 → -114_500_000 centavos
//   - FCL mejorado:        $2,860,000  →  286_000_000 centavos
//
// (El `sampleLado` que sigue NO es una copia exacta del Excel; es un
// subset de los campos que el organism toca — el IMPL recibe el
// `LadoEstado` completo del motor real y la UI decide qué KPIs
// exponer. Los campos no expuestos en UI siguen presentes en el
// fixture para evitar que la IMPL se olvide de tipear el shape
// completo.)
const sampleLado: LadoEstado = {
  total_ingresos: new Decimal(720_000_000),
  gastos_necesarios: new Decimal(380_000_000),
  gastos_no_tan_necesarios: new Decimal(150_000_000),
  gastos_no_necesarios: new Decimal(60_000_000),
  gastos_deudas: new Decimal(244_500_000),
  total_gastos: new Decimal(834_500_000),
  flujo_caja_libre: new Decimal(-114_500_000),
  flujo_ahorro_1: new Decimal(214_000_000),
  gastos_variables_total: new Decimal(210_000_000),
  salario_personal_objetivo: null,
  flujo_ahorro_2: new Decimal(-114_500_000),
  capacidad_inversion: new Decimal(-114_500_000),
  fcl_anual: new Decimal(-1_374_000_000),
  fa2_anual: new Decimal(-1_374_000_000),
  cap_inv_anual: new Decimal(-1_374_000_000),
}

const sampleEstado: EstadoResultados = {
  inicial: sampleLado,
  // Lado Mejorado: FCL sube (mejora del simulador), FA2 también mejora
  // por la baja de variables. El salario sigue siendo null porque este
  // test no setea salarioObjetivoCentavos.
  mejorado: {
    ...sampleLado,
    flujo_caja_libre: new Decimal(286_000_000),
    flujo_ahorro_1: new Decimal(286_000_000),
    flujo_ahorro_2: new Decimal(76_000_000),
    capacidad_inversion: new Decimal(76_000_000),
    fcl_anual: new Decimal(3_432_000_000),
    fa2_anual: new Decimal(912_000_000),
    cap_inv_anual: new Decimal(912_000_000),
  },
}

// ---------------------------------------------------------------------------
// Render helpers.
// ---------------------------------------------------------------------------

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
  estado: EstadoResultados,
  salarioObjetivoCentavos: number | null,
): void {
  act(() => {
    root.render(
      <EstadoResultadosPanel
        estado={estado}
        salarioObjetivoCentavos={salarioObjetivoCentavos}
      />,
    )
  })
}

// ---------------------------------------------------------------------------
// Tests.
// ---------------------------------------------------------------------------

describe('REQ-501 + REQ-502 / Slice 14: EstadoResultadosPanel organism', () => {
  // REQ-501 / UI: el comparativo MUST ser una tabla de 3 columnas:
  // Inicial | Delta | Mejorado. Los nombres exactos de los headers
  // pueden variar ligeramente ("Variación", "Δ", "Cambio"), pero
  // "Inicial" + "Mejorado" son contratos duros (etiquetas visibles
  // que el PRD HU-501 menciona textualmente). Verificamos las 3
  // columnas con regex tolerante para el header central.
  //
  // Given:  un EstadoResultados dual (Inicial vs Mejorado).
  // When:   el organism es rendereado.
  // Then:   el DOM contiene los headers "Inicial", "Mejorado" y un
  //         tercer header de Delta (regex `/delta|variación|cambio/i`).
  it('slice14_estado_resultados_renders_3_columns', () => {
    render(sampleEstado, null)

    const text = container.textContent ?? ''
    expect(text).toContain('Inicial')
    expect(text).toContain('Mejorado')
    // El header central puede llamarse "Delta", "Variación" o
    // "Cambio" — todos equivalentes en español neutro. El regex
    // acepta cualquiera de las tres variantes.
    expect(text).toMatch(/delta|variaci[oó]n|cambio/i)
  })

  // REQ-501 / UI: el panel MUST exponer una fila por KPI (Ingresos,
  // Gastos, FA1, FA2, Cap.Inversión, más las versiones anuales).
  // Verificamos que las 4 filas mensuales aparecen en el DOM.
  //
  // Given:  un EstadoResultados dual.
  // When:   el organism es rendereado.
  // Then:   el DOM contiene las etiquetas "Ingresos", "Gastos",
  //         "FA1" y "FA2" — los KPIs mensuales principales.
  it('slice14_estado_resultados_renders_one_row_per_kpi', () => {
    render(sampleEstado, null)

    const text = container.textContent ?? ''
    expect(text).toContain('Ingresos')
    expect(text).toContain('Gastos')
    expect(text).toContain('FA1')
    expect(text).toContain('FA2')
  })

  // REQ-501 / UI (contrato de tooling): el panel MUST exponer un
  // `data-testid` estable en el container raíz. Es el contrato para
  // tooling externo (e2e, tests de aceptación manuales, debugging).
  //
  // Given:  cualquier EstadoResultados (no vacío para evitar el
  //         empty-state si el IMPL decide implementar uno).
  // When:   el organism es rendereado.
  // Then:   existe un elemento con `data-testid="estado-resultados"`
  //         en el DOM.
  it('slice14_estado_resultados_exposes_data_testid', () => {
    render(sampleEstado, null)

    expect(
      container.querySelector('[data-testid="estado-resultados"]'),
    ).not.toBeNull()
  })
})