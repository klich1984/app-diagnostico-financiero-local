# Slice 14 — Test plan (fase RED)

> **Fase**: RED (TDD)
> **Slice**: 14 — Estado de Resultados dual (4ª pestaña: Inicial vs Mejorado)
> **REQ cubierto**: REQ-501 (vista dual Inicial vs Mejorado) + REQ-502 (Salario Personal Objetivo configurable)
> **Spec**: `openspec/changes/mvp-financiero-local-first/spec.md` §REQ-501 + §REQ-502 + §REQ-603
> **Design**: `openspec/changes/mvp-financiero-local-first/design.md` §9.1 (motor de KPIs) + §10 (Panel Simulador) + §17 (reglas R-NUEVO-*)
> **Tasks**: T-501, T-502, T-503 (HU-501/502, Slice 14 del roadmap post-MVP)
> **Branch**: `feat/estado-resultados` (creada desde `main` post-Slice 13)

## 1. Alcance de esta fase

Escribir **primero los tests que fallan**. El organism `EstadoResultadosPanel` NO existe todavía. Los tests apuntan a él con un contrato de props explícito. Cuando corra `pnpm test`, el archivo de test debe fallar al resolverse el import — eso ES el estado RED.

Esta fase **no incluye**:

- Creación del archivo `src/components/organisms/EstadoResultadosPanel.tsx` (queda para la fase IMPL).
- Modificación de `src/App.tsx` para agregar la 4ª pestaña "Resultados" (queda para la fase IMPL, junto con el wire del salario objetivo desde el perfil activo).
- Modificación del motor de cálculo en `src/domain/kpis/` (ya está hecho en Slices anteriores — el IMPL sólo lo consume).
- Cualquier commit — el usuario commitea y revisa.

## 2. Contrato pineado (binding con la fase IMPL)

```typescript
// src/components/organisms/EstadoResultadosPanel.tsx
import type { EstadoResultados } from '../../../domain/kpis'

export interface EstadoResultadosPanelProps {
  estado: EstadoResultados
  salarioObjetivoCentavos: number | null
}

export function EstadoResultadosPanel(props: EstadoResultadosPanelProps): JSX.Element
```

El organism es DUMB: consume el `EstadoResultados` ya calculado por `calcularEstadoResultados` del dominio puro (T-503, Slice 6) y lo proyecta en una tabla de 3 columnas. **No recalcula**. La columna Delta la calcula acá mismo restando `inicial - mejorado` y coloreando verde/rojo según el signo, usando comparación decimal.

Contrato de `data-testid`:

- `data-testid="estado-resultados"` — container raíz del panel.

## 3. Tests escritos

Archivo: `src/components/organisms/__tests__/EstadoResultadosPanel.test.tsx`

Total: **3 tests**.

| #   | Test                                                | Escenario (REQ-501/502)                                                                              | Selector                                                       |
| --- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 1   | `slice14_estado_resultados_renders_3_columns`       | El panel renderea una tabla de 3 columnas: Inicial, Mejorado y Delta (header tolerante a variantes). | `container.textContent` (regex tolerante para el header Delta) |
| 2   | `slice14_estado_resultados_renders_one_row_per_kpi` | El panel expone una fila por KPI mensual principal: Ingresos, Gastos, FA1, FA2.                      | `container.textContent`                                        |
| 3   | `slice14_estado_resultados_exposes_data_testid`     | El container raíz expone `data-testid="estado-resultados"` (contrato para tooling e2e + debugging).  | `container.querySelector('[data-testid="estado-resultados"]')` |

### 3.1 Cobertura por branch

- **Happy path con datos** (test 1, 2, 3): un `EstadoResultados` dual con `flujo_caja_libre` y `flujo_ahorro_2` distintos entre Inicial y Mejorado para demostrar el Delta con valores no triviales.

### 3.2 Patrón de render

Mismo patrón que `DistribucionChart.test.tsx` y `MatrizPresupuesto.test.tsx`:

- `react-dom/client` + `createRoot`.
- `act()` de `react-dom/test-utils` (con el deprecation warning esperable — sigue vigente y es el patrón consistente en el codebase).
- `beforeEach` / `afterEach` para cleanup del DOM y `root.unmount()`.
- Sin `@testing-library/react` (regla dura del proyecto: no agregar deps).

El setup file `src/__tests__/setup.ts` ya activa `globalThis.IS_REACT_ACT_ENVIRONMENT = true`.

### 3.3 Decisión de diseño reflejada en el fixture (binding)

REQ-501 / decisión de producto bloqueada #2: el Salario Personal Objetivo NO se descuenta en el lado Inicial. El panel recibe `salarioObjetivoCentavos: number | null` y lo proyecta en la columna "Mejorado"; en la columna "Inicial" la línea "Salario Personal" siempre muestra 0 o vacío. El motor `LadoEstado.salario_personal_objetivo === null` en `calcularLadoInicial` ya lo garantiza — el organism sólo debe respetarlo cuando renderice.

Los valores del fixture siguen el Golden Excel documentado en `src/domain/kpis/index.ts`:

- Ingresos mensuales: $7,200,000 → 720_000_000 centavos
- Gastos totales: $8,345,000 → 834_500_000 centavos
- FA1 (Inicial): $2,140,000 → 214_000_000 centavos
- FA2 (Inicial): -$1,145,000 → -114_500_000 centavos

## 4. Verificación del estado RED

Comando:

```bash
cd "C:/Users/hetan/Documents/desarrollo/opencode/mpv-app-financiera-v1"
pnpm test 2>&1 | tail -10
```

Resultado observado:

- 21 archivos de tests pasan (133 tests verdes, incluyendo los 4 tests del Slice 13 ya merged).
- `src/components/organisms/__tests__/EstadoResultadosPanel.test.tsx` **falla al resolver el import** `"../EstadoResultadosPanel"` (Vite `import-analysis`).
- 0 tests registrados en el archivo que falla — Vitest no llega a correr ningún `it()` porque la falla es a nivel de module-resolution.

Esa falla de module-resolution ES el RED signal correcto. Cuando la fase IMPL cree `EstadoResultadosPanel.tsx`, los 3 tests podrán registrarse y empezar a ejecutarse — primero fallando contra los asserts (hasta que la IMPL esté bien) y luego pasando.

## 5. Fase IMPL (NO parte de esta entrega)

Queda delegada en un agente separado. La fase IMPL deberá:

1. Crear `src/components/organisms/EstadoResultadosPanel.tsx` siguiendo el contrato pineado en §2 (props, data-testid, tabla 3 columnas Inicial | Delta | Mejorado).
2. Implementar la columna Delta:
   - `delta = mejorado - inicial` (en centavos).
   - Verde cuando el delta mejora (p.ej. FA2 sube, gastos bajan). Se deja a criterio del IMPL la regla exacta de "qué cuenta como mejora" — el test RED no la pinnea, sólo verifica que la columna existe.
   - Rojo cuando empeora.
   - Comparación con `Decimal.comparedTo` para evitar drift de IEEE-754.
3. Filas: Ingresos, Gastos, FA1 (flujo_caja_libre), FA2, Cap. Inversión, + versiones anuales. Formato monetario via `formatCentavos` (`domain/precision/money.ts`).
4. En `src/App.tsx`:
   - Agregar `TabActiva = 'transacciones' | 'presupuesto' | 'simulador' | 'resultados'`.
   - Agregar el 4º `<button data-testid="tab-resultados">` con label "Resultados".
   - En el switch de render, agregar la rama `tabActiva === 'resultados'` que monta el `<EstadoResultadosPanel estado={...} salarioObjetivoCentavos={...} />`.
   - Calcular el `estado` con `useMemo` invocando `calcularEstadoResultados(transacciones, catsMin, simulaciones, salarioObjetivoCentavos)` (ya importable de `domain/kpis`).
   - Resolver `salarioObjetivoCentavos` desde el perfil activo (Slice 9 ya tiene el selector multi-perfil; el salario persiste en `Usuarios.salario_objetivo_centavos` según HU-502).
   - Preservar los `console.log` existentes y agregar 1 nuevo mínimo: `console.log('Tab resultados render:', estado)`.
5. Re-correr `pnpm test` y confirmar que los 3 tests de Slice 14 pasan.

## 6. Riesgos conocidos

- **Comparación Decimal vs Number para el color del Delta**: el RED no pinnea la regla de color. La IMPL puede usar `Decimal.comparedTo(0)` o restar y comparar el signo. Mientras la columna aparezca en el DOM, los 3 tests RED pasan.
- **Wire del salario objetivo desde el perfil activo (REQ-502)**: el RED no lo cubre — el test pasa `salarioObjetivoCentavos={null}` en los 3 casos. La IMPL tiene que cablear el valor desde el backend (columna `Usuarios.salario_objetivo_centavos`); esto queda como parte del T-502.
- **`LadoEstado` fixture completo**: el fixture cubre los 15 campos del interface aunque el organism sólo muestre ~7 en UI. Esto es defensa contra olvidos en la IMPL: si el organismo sólo declara 7 campos en su prop, TypeScript lo deja pasar pero el motor de cálculo real pasa los 15. Mantener el fixture completo evita regresiones en el shape.
- **Drag del fixture desde el Excel**: el fixture usa magnitudes del Golden Excel (720_000_000, etc.) pero los campos `total_gastos` y derivados NO son copia exacta del Excel — son los del Slice 6 (que ya pasó los golden tests). No hay riesgo de que los tests RED validen magnitudes incorrectas porque los 3 tests son de presencia de strings, no de importes.

## 7. Archivos creados en esta fase

- `src/components/organisms/__tests__/EstadoResultadosPanel.test.tsx`
- `openspec/changes/mvp-financiero-local-first/slice-14-test-plan.md` (este archivo)

## 8. Commits sugeridos (NO commiteo yo — el usuario decide)

```bash
git add src/components/organisms/__tests__/EstadoResultadosPanel.test.tsx
git commit -m "test: add failing tests for slice 14 (estado de resultados)"

git add openspec/changes/mvp-financiero-local-first/slice-14-test-plan.md
git commit -m "docs: add slice 14 test plan"
```

> Esta es la fase RED. La fase IMPL se delega en un agente separado.
