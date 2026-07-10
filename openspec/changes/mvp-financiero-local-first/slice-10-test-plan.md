# Slice 10 — Plan de Tests (Fase RED)

**Cambio**: `mvp-financiero-local-first`
**Slice**: 10 (Presupuesto matrix UI)
**Fecha**: 2026-07-09
**Fase**: RED del ciclo TDD
**Rama**: `feat/matriz-presupuesto` (creada desde `main`)

> **Esta es la fase RED. La fase IMPL se delega en un agente separado.**

## REQs cubiertos

- **REQ-301** — Matriz de agregación por categoría y naturaleza (totales
  de ingresos / gastos / Flujo de Caja Libre con cierre al centavo contra
  el Excel fuente).
- **REQ-302** — Gráficos de distribución porcentual (este slice cubre
  sólo la wiring mínima; la integración Recharts entra en IMPL).

> Slice 10 es la pieza de UI que consume el agregador
> `calcularMatriz(transacciones, categorias)` de
> `src/domain/agregaciones/matriz.ts` (ya cubierto en slice 4 con
> golden tests). El wiring de la pestaña "Presupuesto" y el uso de
> `useMemo` en `App.tsx` entran también en IMPL.

## Archivos modificados / creados (2 archivos)

| # | Archivo | Tipo | Tests | Estado RED |
|---|---------|------|-------|------------|
| 1 | `src/components/organisms/__tests__/MatrizPresupuesto.test.tsx` | nuevo | 5 | falla a nivel de archivo (no se puede resolver `../MatrizPresupuesto`) |
| 2 | `src/__tests__/App.test.tsx` | modificado | 2 nuevos (3 existentes intactos) | los 2 nuevos fallan (`tab-transacciones` y `tab-presupuesto` no existen en el DOM) |

**Total**: **7 tests nuevos** en 2 archivos (5 del organismo + 2 de la
integración a nivel App).

## Detalle por archivo

### 1) `src/components/organisms/__tests__/MatrizPresupuesto.test.tsx` (5 tests)

Organismo (Atomic Design) que renderiza la matriz: tabla de Ingresos +
tabla de Gastos + sección de totales. Se mantiene "tonto" — recibe la
`MatrizPresupuesto` ya calculada y la pinta.

| Test | Contrato |
|------|----------|
| `slice10_matriz_presupuesto_renders_ingresos_with_categoria_names` | Los nombres de las categorías de Ingreso ('Salario', 'Otros ingresos') están visibles en el DOM |
| `slice10_matriz_presupuesto_renders_gastos_with_categoria_names` | Los nombres de las categorías de Gasto ('Hogar', 'Alimentacion') están visibles en el DOM |
| `slice10_matriz_presupuesto_renders_totales_in_spanish_locale` | Los totales agregados aparecen formateados al español neutro (`7.200.000,00` y `2.770.000,00`) |
| `slice10_matriz_presupuesto_renders_empty_state_when_no_data` | Cuando no hay transacciones, se renderiza un mensaje vacío con el texto `/no hay transacciones/i` |
| `slice10_matriz_presupuesto_exposes_data_testids` | El componente expone los hooks `data-testid="matriz-ingresos"`, `data-testid="matriz-gastos"` y `data-testid="matriz-totales"` |

Props esperadas:
```typescript
import type { MatrizPresupuesto as MatrizPresupuestoData } from
  '../../../domain/agregaciones/matriz'

export interface MatrizPresupuestoProps {
  matriz: MatrizPresupuestoData
  cargando?: boolean
}

export function MatrizPresupuesto(props: MatrizPresupuestoProps): JSX.Element
```

### 2) `src/__tests__/App.test.tsx` (2 tests nuevos, 3 existentes intactos)

El shell de la app expone dos pestañas en la parte superior:
"Transacciones" (comportamiento actual) y "Presupuesto" (nueva vista de
matriz). No se usa React Router — es state local con `useState<Tab>`.
Los 2 tests nuevos verifican la presencia de los botones de tab y el
wireado de la matriz cuando la pestaña "Presupuesto" está activa.

| Test | Contrato |
|------|----------|
| `slice10_app_renders_tabs_for_transacciones_and_presupuesto` | Ambos botones de tab están presentes en el DOM (`data-testid="tab-transacciones"` y `data-testid="tab-presupuesto"`) con sus textos visibles |
| `slice10_app_shows_matriz_container_when_presupuesto_tab_is_active` | En el render inicial, `data-testid="matriz-presupuesto"` NO está en el DOM; tras hacer click en la pestaña Presupuesto, el contenedor SÍ aparece |

## Contrato de selectores `data-testid`

Para que los tests sean deterministas, el IMPL debe exponer los
siguientes `data-testid`:

- `data-testid="matriz-presupuesto"` — contenedor raíz del organismo
- `data-testid="matriz-ingresos"` — tabla de Ingresos
- `data-testid="matriz-gastos"` — tabla de Gastos
- `data-testid="matriz-totales"` — pie con totales agregados
- `data-testid="tab-transacciones"` — botón de la pestaña Transacciones
- `data-testid="tab-presupuesto"` — botón de la pestaña Presupuesto

## Estado RED confirmado

```
$ pnpm test

 Test Files  2 failed | 17 passed (19)
      Tests  2 failed | 102 passed (104)
```

- `src/components/organisms/__tests__/MatrizPresupuesto.test.tsx`:
  falla con `Failed to resolve import "../MatrizPresupuesto"`. El
  organismo no existe todavía (esperado: la IMPL lo crea).
- `src/__tests__/App.test.tsx`: los 2 tests nuevos de slice 10 fallan
  porque los botones de tab no existen en el DOM actual.
- 102 tests preexistentes siguen pasando — no hay regresión.

## Pendiente para la fase IMPL (delegado a otro agente)

- [ ] Crear `src/components/organisms/MatrizPresupuesto.tsx` con la
      firma pinneada arriba y los `data-testid` del contrato.
- [ ] Crear el state local `useState<Tab>` en `App.tsx` y los dos
      botones de tab con sus `data-testid` y textos en español neutro.
- [ ] Renderizar condicionalmente `<MatrizPresupuesto matriz={...} />`
      cuando la tab Presupuesto está activa.
- [ ] Cablear `useMemo` sobre `calcularMatriz(transacciones,
      categorias)` en `App.tsx` con dependencias estables.
- [ ] Preservar los 4 `console.log` existentes de debugging y agregar
      como mínimo 1 log para la ejecución del cálculo de la matriz.

## Commits sugeridos (los ejecuta el usuario, no el agente)

1. `test: add failing tests for slice 10 (matriz presupuesto)`
2. `docs: add slice 10 test plan`

## Riesgos identificados

- **Recharts no se introduce en este slice.** La dependencia se agrega
  en IMPL cuando se rendericen los gráficos. La UI de la matriz
  misma no necesita Recharts (es solo tabla + totales).
- **Estado local vs. URL routing.** El plan descarta router por la
  regla dura #5 ("Sin límite duro de transacciones" + "Multi-perfil con
  selector al abrir"). Si en un futuro se requiere URL compartible, se
  reabre la decisión.
- **Cierre al centavo.** El fixture del test usa valores enteros en
  centavos para que `formatCentavos` produzca strings estables. La IMPL
  debe respetar la frontera: `Decimal` en cálculos, `formatCentavos`
  en presentación, jamás `Number` para montos.
