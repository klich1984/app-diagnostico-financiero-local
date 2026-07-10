# Slice 11 — Plan de Tests (Fase RED)

**Cambio**: `mvp-financiero-local-first`
**Slice**: 11 (Simulador UI — tercer tab)
**Fecha**: 2026-07-10
**Fase**: RED del ciclo TDD
**Rama**: `feat/simulador-ui` (creada desde `main` post-merge del slice 10)

## REQs cubiertos

- **REQ-602** — Validación de enumeraciones / comandos del Simulador
  (CRUD de la tabla `Simulador`).
- **REQ-603** — Soporte multi-perfil con aislamiento de datos (las
  propuestas del Simulador también filtran por `usuario_id`).

> Decisión de producto del slice 11: se incorpora un tercer tab
> "Simulador" junto a "Transacciones" y "Presupuesto". El filtro
> aislante del slice 5 (`filtrarGastosNoEsenciales` —
> `src/domain/simulador/filtro.ts`) ya está MERGED; el organismo lo
> reutiliza tal cual.

## Archivos modificados / creados (3 archivos)

| # | Archivo | Tipo | Tests nuevos | Estado RED |
|---|---------|------|--------------|------------|
| 1 | `src-tauri/tests/commands_test.rs` | modificado | 4 nuevos | no compila (`cargo test --no-run` falla con `unresolved imports` de `cmd_*_simulacion*_impl` y `SimulacionCompletaDto`) |
| 2 | `src/data/__tests__/tauri-commands.test.ts` | modificado | 3 nuevos | fallan en runtime (`TypeError: ... is not a function`); los wrappers `obtenerSimulaciones` / `upsertSimulacion` / `eliminarSimulacion` no existen |
| 3 | `src/components/organisms/__tests__/SimuladorPanel.test.tsx` | nuevo | 4 | falla el archivo entero (no se puede resolver `../SimuladorPanel`) |

**Total**: **11 tests** nuevos en 3 archivos (4 Rust + 3 TS wrapper + 4 component).

## Detalle por archivo

### 1) `src-tauri/tests/commands_test.rs` (4 tests nuevos)

Tests del binding que la IMPL debe satisfacer en `crate::commands`:

| Test | Comando | Contrato esperado |
|------|---------|-------------------|
| `req_602_cmd_listar_simulaciones_returns_empty_initially` | `cmd_listar_simulaciones_impl(&Connection, usuario_id: i64)` | DB recién sembrada ⇒ `Vec<SimulacionCompletaDto>` con `len() == 0` |
| `req_602_cmd_upsert_simulacion_inserts_new_simulation` | `cmd_upsert_simulacion_impl(&Connection, transaccion_id: i64, nuevo_valor_centavos: i64, usuario_id: i64)` | Inserta fila nueva (no había previa), devuelve `id > 0`, aparece en el listado con el valor enviado |
| `req_602_cmd_upsert_simulacion_updates_existing` | mismo | Segundo upsert sobre la misma `transaccion_id` ⇒ `len == 1` y `nuevo_valor_centavos` refrescado (semántica UPSERT, no INSERT duplicado) |
| `req_602_cmd_eliminar_simulacion_removes_row` | `cmd_eliminar_simulacion_impl(&Connection, transaccion_id: i64)` | Borra la propuesta por `transaccion_id`; el listado posterior queda vacío |

DTO esperado (espejo de `Simulador` JOIN Transacciones, mismo shape
que el binding TS):

```rust
#[derive(serde::Serialize, Clone, Debug)]
pub struct SimulacionCompletaDto {
    pub id: i64,
    pub usuario_id: i64,
    pub transaccion_id: i64,
    pub nuevo_valor_centavos: i64,
    pub created_at: i64,
    pub updated_at: i64,
}
```

> Cobertura extra de `delete` (más allá del mínimo de 3 tests pedidos
> por el slice): incluye el cuarto test para mantener simetría con el
> patrón de slice 7 (`insert` + `list` + `delete`) y reforzar la
> confianza de REQ-602.

### 2) `src/data/__tests__/tauri-commands.test.ts` (3 tests nuevos)

| Test | Wrapper | Shape del payload IPC esperado |
|------|---------|-------------------------------|
| `obtenerSimulaciones invokes cmd_listar_simulaciones` | `obtenerSimulaciones(usuarioId)` | `invoke('cmd_listar_simulaciones', { usuarioId })` |
| `upsertSimulacion invokes cmd_upsert_simulacion with input` | `upsertSimulacion({transaccionId, nuevoValorCentavos, usuarioId})` | `invoke('cmd_upsert_simulacion', { input: {…} })` (envuelto bajo `input`) |
| `eliminarSimulacion invokes cmd_eliminar_simulacion` | `eliminarSimulacion(transaccionId)` | `invoke('cmd_eliminar_simulacion', { transaccionId })` (top-level) |

Tipos a añadir a `tauri-commands.ts`:

```typescript
export interface SimulacionCompletaDto {
  id: number
  usuario_id: number
  transaccion_id: number
  nuevo_valor_centavos: number
  created_at: number
  updated_at: number
}

export interface UpsertSimulacionInput {
  transaccionId: number
  nuevoValorCentavos: number
  usuarioId: number
}

export async function obtenerSimulaciones(
  usuarioId: number,
): Promise<SimulacionCompletaDto[]>

export async function upsertSimulacion(
  input: UpsertSimulacionInput,
): Promise<number>

export async function eliminarSimulacion(
  transaccionId: number,
): Promise<void>
```

### 3) `src/components/organisms/__tests__/SimuladorPanel.test.tsx` (4 tests)

Organism (Atomic Design) que renderiza el Panel Simulador:

| Test | Contrato |
|------|----------|
| `renders the list of non-essential gastos` | Texto contiene `Cafe premium` (fila No-tan-necesario) |
| `does NOT render gastos that are Necesario` | Texto NO contiene `Arriendo` (fila Necesario, fuera del universo del Simulador) |
| `renders empty state when no non-essential gastos` | Texto matchea `/no hay gastos no esenciales/i` |
| `calls onUpsert when an input changes` | Tras tipear `50000` en el input `[data-testid="simulador-input-1"]` y esperar >300ms (debounce) ⇒ `onUpsert({transaccionId: 1, nuevoValorCentavos: 50000, usuarioId: 1})` |

Props esperadas (binding con la IMPL):

```typescript
interface SimuladorPanelProps {
  transacciones: TransaccionCompletaDto[]
  categorias: CategoriaDto[]
  simulaciones: SimulacionCompletaDto[]
  onUpsert: (input: UpsertSimulacionInput) => void | Promise<void>
  onEliminar: (transaccionId: number) => void | Promise<void>
  cargando?: boolean
}
```

Contrato de `data-testid` (para IMPL y e2e):

- `simulador-panel`     — root container
- `simulador-input-{id}` — input por cada gasto simulable (id = `Transaccion.id`)
- `simulador-vacio`     — placeholder del empty state

El organismo DEBE reutilizar el filtro existente
`src/domain/simulador/filtro.ts` (`filtrarGastosNoEsenciales`) para
cumplir la regla dura del slice 5: nunca muestra gastos
`Necesario`. La IMPL puede (y debe) apoyarse en este módulo sin
re-implementarlo.

## Estado RED verificado

```
$ cd src-tauri && cargo test --no-run
error[E0432]: unresolved imports
  `cmd_listar_simulaciones_impl`,
  `cmd_eliminar_simulacion_impl`,
  `cmd_upsert_simulacion_impl`,
  `SimulacionCompletaDto`
  --> src-tauri/tests/commands_test.rs:60:5

$ pnpm test
Test Files  2 failed | 18 passed (20)
     Tests  3 failed | 115 passed (118)
```

Detalle de los fallos en `pnpm test`:

- `src/data/__tests__/tauri-commands.test.ts` — 3 tests fallan por
  `TypeError: obtenerSimulaciones is not a function` /
  `upsertSimulacion is not a function` /
  `eliminarSimulacion is not a function` (wrappers no exportados).
- `src/components/organisms/__tests__/SimuladorPanel.test.tsx` — el
  archivo entero no se puede recolectar por
  `Failed to resolve import "../SimuladorPanel"`.

> Si la IMPL introduce los 3 módulos IMPL pendientes y firma las
> funciones con la forma pineada arriba, los 11 tests nuevos + los 107
> tests previos seguirán pasando (115 + 11 esperados = 126 total).

## Trabajo NO incluido en la fase RED

Esta fase NO crea ningún archivo de implementación. Queda pendiente
para la fase IMPL:

- `src-tauri/src/commands.rs` — agregar el DTO `SimulacionCompletaDto`
  + los 3 `cmd_*_simulacion*_impl` + los 3 wrappers
  `#[tauri::command]`. Reutilizar el `simulador::repo` que ya existe
  (las funciones `upsert`, `list_by_user`, `delete` están mergeadas;
  los `_impl` solo las envuelven y proyectan a `SimulacionCompletaDto`).
- `src-tauri/src/lib.rs` — registrar los 3 nuevos commands en
  `tauri::generate_handler!`.
- `src/data/tauri-commands.ts` — agregar los tipos `SimulacionCompletaDto`
  + `UpsertSimulacionInput` y los 3 wrappers.
- `src/components/organisms/SimuladorPanel.tsx` — implementar el
  organism. **Reglas duras**: (1) reutilizar
  `filtrarGastosNoEsenciales` de `domain/simulador/filtro.ts`; (2)
  usar `createDebouncedCallback` de `domain/simulador/debounce.ts` con
  delay de 300ms para `onUpsert`; (3) exponer los `data-testid`
  pineados arriba.
- `src/App.tsx` — wire in del tercer tab "Simulador" + state de
  simulaciones + carga al montar la pestaña + handler que llama
  `upsertSimulacion` con debounce + refetch.
- `src/components/organisms/MatrizPresupuesto.tsx` (opcional) — modo
  "mejorado" que muestra deltas vs la matriz base usando
  `calcularMatrizMejorada` de `domain/simulador/matriz-mejorada.ts` (ya
  mergeado en slice 5). Si no entra en review budget, dejar solo el
  Panel Simulador como entrega del slice.

> Esta es la fase RED. La fase IMPL se delega en un agente separado.

## Riesgos / Notas para la IMPL

1. **Review budget**: el slice está cerca del límite de 400 líneas
   sugerido. Si la IMPL excede eso, considerar chaining PR (split de
   `commands.rs` + `lib.rs` por un lado; `tauri-commands.ts` +
   `SimuladorPanel.tsx` + `App.tsx` por otro). Sugerido: encadenar
   primero el backend (`commands_test.rs` queda verde), después el
   frontend (`SimuladorPanel.test.tsx` queda verde).
2. **`cmd_upsert_simulacion_impl` con `usuario_id` explícito**: la
   firma pineada por este test plan (`(conn, tx_id, valor, usuario_id)`)
   difiere del `simulador::repo::upsert` actual
   (`(conn, &SimulacionInput)` que resuelve `usuario_id` desde
   `Transacciones`). La IMPL tiene dos opciones: (a) adaptar la firma
   del `_impl` para aceptar `usuario_id` explícito y validar que
   coincide con `Transacciones.usuario_id`; (b) aceptar `usuario_id`
   por consistencia con el contrato IPC pero IGNORARLO (resolución
   desde la transacción). Recomendado: opción (a) para defensa en
   profundidad (REQ-603).
3. **Debounce en el organism**: el test usa timers reales (no
   `vi.useFakeTimers`) — la IMPL DEBE usar
   `createDebouncedCallback(..., 300)` para que el test pase. Si la
   IMPL usa un debounce distinto (>300ms, p. ej. 500ms), el test
   seguirá pasando pero será más lento; documentar la elección.
4. **Filtro Necesario**: la IMPL DEBE importar
   `filtrarGastosNoEsenciales` de
   `src/domain/simulador/filtro.ts`. El test `does NOT render gastos
   that are Necesario` falla si la IMPL renderiza directamente las
   `transacciones` recibidas sin filtrar.
