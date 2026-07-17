# Slice 12 — Plan de Tests (Fase RED)

**Cambio**: `mvp-financiero-local-first`
**Slice**: 12 (Aplicar button per row — reemplazo del debounce)
**Fecha**: 2026-07-11
**Fase**: RED del ciclo TDD
**Rama**: `feat/simulador-ui` (misma rama que el slice 11; esta es la
evolución natural de la IMPL del slice 11, no un nuevo branch)

## Decisión de producto (locked)

El slice 11 implementó el panel del Simulador con persistencia
**auto-disparada por debounce de 300 ms**: cada keystroke en un input
encolaba un `onUpsert` que se enviaba al backend 300 ms después de la
última tecla. La UX resultante era confusa: el usuario tipeaba un valor
a medio terminar y ya estaba escribiendo a SQLite.

El slice 12 reemplaza ese comportamiento por un contrato explícito:

1. **No más debounce.** El cambio en el input NO dispara `onUpsert`
   automáticamente. El local state guarda el string tipeado, y nada más.
2. **Un botón "Aplicar" por fila.** Al lado de cada input se renderiza
   un `<button data-testid="aplicar-{transaccionId}">Aplicar</button>`
   que es la ÚNICA vía para invocar `onUpsert`.
3. **Botón disabled cuando no hay diff.** El botón arranca `disabled`
   (el input muestra el valor persistido, sin cambios). Apenas el
   usuario tipea algo distinto al valor persistido, el botón pasa a
   `enabled`. Tras el click vuelve a `disabled` (el "nuevo valor
   persistido" ahora coincide con lo tipeado).
4. **Texto del botón en español neutro** ("Aplicar"), coherente con la
   decisión locked #1.

## REQs cubiertos

- **REQ-402** — Recálculo en tiempo real con persistencia (evolución).
  La spec original describía persistencia automática con debounce; el
  slice 12 refina ese contrato a "persistencia manual por click
  explícito", manteniendo intactos los escenarios de REQ-402 (el
  resultado final es el mismo: el valor propuesto queda en SQLite, el
  ahorro mensual/anual/FCL se recalcula con la matriz mejorada).

> Nota: el refinamiento "auto → manual" NO contradice los escenarios
> formales de REQ-402 (Modificación de valor en simulador +
> Anualización del ahorro). El usuario sigue pudiendo "modificar el
> valor" y ver el recálculo; lo único que cambia es el trigger de la
> persistencia. La sección §10.1 (filtro) y §11 (Panel) del design
> siguen siendo válidas.

## Archivos modificados / creados (2 archivos)

| # | Archivo | Tipo | Tests nuevos | Estado RED |
|---|---------|------|--------------|------------|
| 1 | `src/components/organisms/__tests__/SimuladorPanel.test.tsx` | modificado | 4 nuevos (1 viejo removido) | 4 fallan: 3 por `[data-testid="aplicar-1"]` ausente, 1 por el debounce aún activo |
| 2 | `openspec/changes/mvp-financiero-local-first/slice-12-test-plan.md` | nuevo | — | n/a (doc) |

**Total**: **4 tests** nuevos (3 slice 11 que validan estructura +
4 nuevos slice 12 = **7 tests** en el archivo). Estado actual: 3 pasan
(estructura slice 11 preservada) + 4 fallan (RED slice 12).

## Detalle de los 4 tests nuevos

| # | Test | Contrato (Given/When/Then) |
|---|------|---------------------------|
| 1 | `REQ-402: Aplicar button is disabled when input matches persisted value` | Given el panel renderiza con la fixture de muestra. When el usuario aún no tocó el input. Then `[data-testid="aplicar-1"]` existe y tiene `disabled === true`. |
| 2 | `REQ-402: Aplicar button is enabled when input differs from persisted value` | Given el panel renderiza con la fixture. When el usuario tipea `50000` (PESOS) en `[data-testid="simulador-input-1"]` (diverge de los 1.500 PESOS formateados desde el valor persistido). Then `[data-testid="aplicar-1"]` tiene `disabled === false`. |
| 3 | `REQ-402: Aplicar button click calls onUpsert with the typed value` | Given la fixture + un `vi.fn().mockResolvedValue(undefined)` como `onUpsert`. When el usuario tipea `50000` PESOS y hace click en `[data-testid="aplicar-1"]`. Then `onUpsert` se llamó exactamente UNA vez con `{ transaccionId: 1, nuevoValorCentavos: 5_000_000, usuarioId: 1 }` (50.000 pesos × 100 = 5.000.000 centavos). |
| 4 | `REQ-402: Aplicar button does NOT auto-fire on input change (no debounce)` | Given la fixture + un spy `onUpsert`. When el usuario tipea `50000` y espera 500 ms (> ventana del viejo debounce de 300 ms) SIN clickear. Then `onUpsert` NO fue llamado. |

> Test #3 incluye `toHaveBeenCalledTimes(1)` además del `toHaveBeenCalledWith`.
> Eso previene que la IMPL introduzca accidentalmente doble invocación
> (ej. un debounce residual + el handler del click).

> Test #4 es el que más duele al slice 11: el organismo actual SÍ
> dispara `onUpsert` automáticamente (por eso falla hoy). Es la prueba
> contractual de que el debounce murió.

### Test removido

Se eliminó el test del slice 11 `calls onUpsert when an input changes`
(que verificaba el debounce de 300 ms con auto-fire). La IMPL del
slice 12 lo reemplaza con los 4 tests nuevos. El nombre está
descriptivamente reemplazado.

## Contrato de `data-testid` (binding con la IMPL)

| `data-testid` | Elemento | Notas |
|---------------|----------|-------|
| `simulador-panel` | root container | Sin cambios desde slice 11. |
| `simulador-input-{id}` | input controlado | Sin cambios. Continúa CONTROLADO (la IMPL del slice 11 lo dejó así para evitar pisar el texto). |
| `simulador-vacio` | empty-state placeholder | Sin cambios. |
| `aplicar-{id}` | **NUEVO** botón por fila | Único trigger de `onUpsert`. `id` = `transaccionId` (PK). |
| `simulador-eliminar-{id}` | botón × de la propuesta | Sin cambios (sigue presente cuando hay `sim` activa). |

## Estado RED verificado

```
$ pnpm test
 Test Files  1 failed | 19 passed (20)
      Tests  4 failed | 125 passed (129)
```

Detalle de los 4 fallos en
`src/components/organisms/__tests__/SimuladorPanel.test.tsx`:

1. `REQ-402: Aplicar button is disabled when input matches persisted value`
   → `expected null not to be null` en
   `container.querySelector('[data-testid="aplicar-1"]')`.
2. `REQ-402: Aplicar button is enabled when input differs from persisted value`
   → `expected null not to be null` en el mismo selector.
3. `REQ-402: Aplicar button click calls onUpsert with the typed value`
   → `expected null not to be null` en el mismo selector.
4. `REQ-402: Aplicar button does NOT auto-fire on input change (no debounce)`
   → `expected "spy" to not be called at all, but actually been called 1 times`
   (el debounce del slice 11 todavía dispara `onUpsert`).

Los 3 tests slice 11 que validan estructura (renders, does-NOT-render-
Necesario, empty state) **siguen pasando** — el refactor preserva la
forma externa del organismo.

## Trabajo NO incluido en la fase RED

Esta fase NO toca la implementación. Queda pendiente para la fase
IMPL (delegada en un agente separado, con el `sdd-apply` skill):

1. **`src/components/organisms/SimuladorPanel.tsx`** — refactor:
   - Eliminar `import { createDebouncedCallback }` y todo uso.
   - Eliminar el `useMemo` que construye `debouncedUpsert`.
   - Eliminar la llamada a `debouncedUpsert.call(...)` dentro del
     `onChange` del input. Mantener el `setInputValues((prev) => ({...}))`.
   - Renderizar un botón por fila:
     ```tsx
     <button
       type="button"
       data-testid={`aplicar-${id}`}
       disabled={inputValues[id] === undefined || parsePesosInput(inputValues[id]) === currentValue}
       onClick={() => {
         const centavos = parsePesosInput(inputValues[id] ?? formatCentavosForInput(currentValue))
         if (centavos !== null && dto?.usuario_id !== undefined) {
           void onUpsert({
             transaccionId: id,
             nuevoValorCentavos: centavos,
             usuarioId: dto.usuario_id,
           })
         }
       }}
       aria-label={`Aplicar nuevo valor propuesto para ${dto?.concepto ?? t.concepto}`}
       className="..."
     >
       Aplicar
     </button>
     ```
   - **Decisión de disable** (binding con los tests):
     - `disabled === true` cuando NO hay cambios pendientes:
       `inputValues[id]` es `undefined` (usuario no tocó el input) ó el
       valor parseado (PESOS → CENTAVOS) coincide con `currentValue`
       (el persistido, que ya puede incluir una `sim` activa).
     - `disabled === false` cuando hay diff. Apenas el usuario tipea,
       la condición se rompe y el botón se habilita.
   - **Posición en la fila**: a la derecha del input, antes del botón
     × de eliminar (cuando exista). Esto mantiene la jerarquía visual
     "input → acción principal → acción destructiva".
2. **Reglas de UX (opcional pero recomendado)**:
   - Estilo del botón Aplicar cuando `disabled`: variantes tailwind
     `bg-slate-200 text-slate-400 cursor-not-allowed`.
   - Estilo cuando `enabled`: `bg-blue-600 text-white hover:bg-blue-700`.
   - Si el input queda con texto inválido (`parsePesosInput` retorna
     `null`), el botón Aplicar sigue `disabled` (no hay valor
     numérico para commitear).
3. **No tocar** `App.tsx` ni `tauri-commands.ts` — el contrato IPC no
   cambia. `onUpsert` sigue recibiendo la misma shape
   `{ transaccionId, nuevoValorCentavos, usuarioId }`.

> Esta es la fase RED. La fase IMPL se delega en un agente separado.

## Riesgos / Notas para la IMPL

1. **Cuidado con `inputValues[id] === undefined` vs string vacío**.
   Si la IMPL hace `setInputValues({...prev, [id]: ''})` en el primer
   keystroke (que reemplaza el caracter tipeado), el test #1
   (disabled cuando NO se tocó) sigue pasando, pero el test #2
   (enabled al tipear) depende de que `''` se considere "diferente al
   valor persistido". La condición de disable recomendada es:
   ```ts
   disabled={(() => {
     const raw = inputValues[id]
     if (raw === undefined) return true
     const centavos = parsePesosInput(raw)
     if (centavos === null) return true
     return centavos === currentValue
   })()}
   ```
2. **El `useMemo` del debounce debe removerse COMPLETO**. Si la IMPL
   deja el `debouncedUpsert` aunque no lo use, no hay error de TS pero
   sí queda código muerto — el verificador de cobertura o el linter
   puede quejarse. Recomendado: borrarlo junto con el import.
3. **Botón × de eliminar**: el slice 11 ya lo renderiza sólo cuando
   hay una `sim` activa (es decir, después de un upsert previo). La
   IMPL del slice 12 NO debe tocar esa lógica — sigue siendo válida.
4. **Accesibilidad**: el `aria-label` del botón Aplicar debe incluir
   el concepto del gasto para que screen-readers no lean solo
   "Aplicar" repetido. Patrón recomendado:
   `aria-label={`Aplicar nuevo valor propuesto para ${concepto}`}`.
5. **Review budget**: el refactor está acotado a
   `SimuladorPanel.tsx` (~365 líneas hoy). Las líneas netas estimadas
   son +15/-10, bien dentro del budget de 400 líneas por PR. NO se
   requiere chained PR para este slice.
6. **`parsePesosInput` ya existe** en `src/domain/precision/money`
   (mergeado en el slice 11). La IMPL no debe re-implementarlo.

## Próximo paso (handoff a fase IMPL)

Esperar revisión del usuario. Una vez aprobado este test plan + el
código RED, lanzar el agente `sdd-apply` (con `delegate_only: true`)
para que implemente el refactor de `SimuladorPanel.tsx` y deje
verdes los 4 tests nuevos. El objetivo IMPL:

```
Test Files  1 failed | 19 passed (20)   ← RED (hoy)
Test Files  20 passed (20)              ← GREEN esperado post-IMPL
     Tests  129 passed (129)
```

Tras IMPL, fase VERIFY (`sdd-verify`) corre la suite completa +
`cargo test` para confirmar que nada se rompió en el backend.