# Slice 13 — Test plan (fase RED)

> **Fase**: RED (TDD)
> **Slice**: 13 — Charts de distribución en la pestaña Presupuesto
> **REQ cubierto**: REQ-302 (Gráficos de distribución porcentual)
> **Spec**: `openspec/changes/mvp-financiero-local-first/spec.md` §REQ-302
> **Design**: `openspec/changes/mvp-financiero-local-first/design.md` §1
> (capa React con Recharts) + §7 (Atomic Design).
> **Tasks**: T-302..T-303 (HU-302, Slice 13 del roadmap post-MVP).
> **Branch**: `feat/charts-distribucion` (creada desde `main` post-Slice 12).

## 1. Alcance de esta fase

Escribir **primero los tests que fallan**. El organism `DistribucionChart`
NO existe todavía. Los tests apuntan a él con un contrato de props
explícito. Cuando corra `pnpm test`, el archivo de test debe fallar al
resolverse el import — eso ES el estado RED.

Esta fase **no incluye**:

- Instalación de la dependencia `recharts` (queda para la fase IMPL).
- Creación del archivo `src/components/organisms/DistribucionChart.tsx`.
- Modificación de `src/App.tsx` (queda para la fase IMPL cuando
  montemos los 2 charts debajo de la matriz en la pestaña Presupuesto).
- Cualquier commit — el usuario commitea y revisa.

## 2. Contrato pineado (binding con la fase IMPL)

```typescript
// src/components/organisms/DistribucionChart.tsx
import type { DistribucionPorcentual } from '../../../domain/agregaciones/graficos'

export interface DistribucionChartProps {
  distribucion: DistribucionPorcentual[]
  titulo: string
}

export function DistribucionChart(
  props: DistribucionChartProps,
): JSX.Element
```

El organism es DUMB: consume la distribución ya calculada por
`distribucionGastosPorCategoria` / `distribucionIngresosPorCategoria`
del dominio puro. **No recalcula**.

Contrato de `data-testid`:

- `data-testid="distribucion-chart"` — container raíz del chart.

Contrato de selectors Recharts (API pública documentada por Recharts):

- `path.recharts-sector` — un `<path>` por porción del PieChart.

## 3. Tests escritos

Archivo: `src/components/organisms/__tests__/DistribucionChart.test.tsx`

Total: **4 tests**.

| #   | Test                                                                 | Escenario (REQ-302)                                                                                  | Selector                                                                                |
| --- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 1   | `slice13_distribucion_chart_renders_titulo`                          | El organism renderea el `titulo` provisto en el DOM.                                                | `container.textContent` (regex tolerant)                                                |
| 2   | `slice13_distribucion_chart_renders_one_segment_per_item`            | El PieChart emite un `path.recharts-sector` por cada item en `distribucion`. Exactitud 1:1.         | `container.querySelectorAll('path.recharts-sector')`                                    |
| 3   | `slice13_distribucion_chart_renders_empty_state`                     | `distribucion=[]` → mensaje "no hay datos" en español (no PieChart vacío ni crash de Recharts).      | `container.textContent` regex `/no hay datos/i`                                          |
| 4   | `slice13_distribucion_chart_exposes_data_testid`                     | Container raíz tiene `data-testid="distribucion-chart"` (contrato para tooling e2e y debugging).    | `container.querySelector('[data-testid="distribucion-chart"]')`                         |

### 3.1 Cobertura por branch

- **Happy path con datos** (test 1, 2, 4): distribución con 3 items
  (`Hogar`, `Alimentacion`, `Otros`), cada uno con `Decimal` + `number`
  porcentaje.

- **Empty path** (test 3): `distribucion=[]`.

### 3.2 Patrón de render

Mismo patrón que `MatrizPresupuesto.test.tsx`:

- `react-dom/client` + `createRoot`.
- `act()` de `react-dom/test-utils` (con el deprecation warning
  esperable — sigue vigente y es el patrón consistente en el codebase).
- `beforeEach` / `afterEach` para cleanup del DOM y `root.unmount()`.
- Sin `@testing-library/react` (regla dura del proyecto: no agregar deps).

El setup file `src/__tests__/setup.ts` ya activa
`globalThis.IS_REACT_ACT_ENVIRONMENT = true`.

## 4. Verificación del estado RED

Comando:

```bash
cd "C:/Users/hetan/Documents/desarrollo/opencode/mpv-app-financiera-v1"
pnpm test 2>&1 | tail -10
```

Resultado esperado (y observado):

- 20 archivos de tests pasan (129 tests verdes).
- `src/components/organisms/__tests__/DistribucionChart.test.tsx`
  **falla al resolver el import** `"../DistribucionChart"`.
- 0 tests registrados en el archivo que falla — Vitest no llega a
  correr ningún `it()` porque la falla es a nivel de
  `import-analysis` (transform de Vite).

Esa falla de module-resolution ES el RED signal correcto. Cuando la
fase IMPL cree `DistribucionChart.tsx` e instale `recharts`, los 4
tests podrán registrarse y empezar a ejecutarse — primero fallando
contra los asserts (hasta que la IMPL esté bien) y luego pasando.

## 5. Fase IMPL (NO parte de esta entrega)

Queda delegada en un agente separado. La fase IMPL deberá:

1. `pnpm add recharts` (sin tocar el lockfile de forma sucia: pin
   compatible con React 18 + Tauri WebView).
2. Crear `src/components/organisms/DistribucionChart.tsx` siguiendo el
   contrato pineado en §2 (props, data-testid, empty state en español).
3. Verificar visualmente que el chart se monta con
   `ResponsiveContainer` + `PieChart` + `Pie` + `Cell` + `Tooltip`.
4. En `src/App.tsx`, debajo del `<MatrizPresupuesto />` en la pestaña
   Presupuesto, montar 2 instancias:
   - `<DistribucionChart distribucion={distGastos} titulo="Distribución de gastos" />`
   - `<DistribucionChart distribucion={distIngresos} titulo="Distribución de ingresos" />`
5. Re-correr `pnpm test` y confirmar que los 4 tests de Slice 13
   pasan.

## 6. Riesgos conocidos

- **Recharts `path.recharts-sector` es API pública pero interna**.
  Si Recharts decide removerlo en una major version, el test 2
  quedará acoplado. Mitigación: el selector está pineado en el
  comentario del test file, fácil de cambiar. Si pasa, actualizar
  también el contract note del IMPL.
- **`<canvas>` vs `<svg>`**: la RED phase asume que Recharts renderiza
  con SVG (lo cual es el comportamiento por defecto + el caso
  compatible con `ResponsiveContainer` en jsdom). Si la IMPL decide
  pasar a canvas, el test 2 rompe — pero esa es una decisión de IMPL,
  no de RED.
- **Decimales en jsdom**: el fixture usa enteros simples
  (`new Decimal(1870000)`) en vez de centavos
  (`new Decimal(1870000_00)`). El organism es DUMB y solo formatea con
  `formatCentavos(decimal.toNumber())` asumiendo centavos. Ajustar en
  IMPL si los tests exigen ver el formato exacto (no es el caso en
  RED — los tests solo chequean el chart, no los textos formateados).

## 7. Archivos creados en esta fase

- `src/components/organisms/__tests__/DistribucionChart.test.tsx`
- `openspec/changes/mvp-financiero-local-first/slice-13-test-plan.md` (este archivo)

## 8. Commits sugeridos (NO commiteo yo — el usuario decide)

```bash
git add src/components/organisms/__tests__/DistribucionChart.test.tsx
git commit -m "test: add failing tests for slice 13 (distribucion charts)"

git add openspec/changes/mvp-financiero-local-first/slice-13-test-plan.md
git commit -m "docs: add slice 13 test plan"
```

> Esta es la fase RED. La fase IMPL se delega en un agente separado.
