# Plan de Tests — Slice 5 (Fase RED)

> **Propósito**: documentar la fase RED de TDD para el slice 5
> (Épica 4: HU-401, HU-402, HU-403 — Simulador de Oportunidades) y
> dejar el fixture de tests listo para que la fase IMPL (delegada a
> un agente separado) solo tenga que escribir los módulos para que
> pasen.
>
> **Idioma**: español neutro (consistente con el resto de openspec).
>
> **Estado actual**: fase **RED**. Los tests fallan al compilar
> porque los módulos target (`src-tauri/src/simulador/repo.rs`,
> `src/domain/simulador/filtro.ts`,
> `src/domain/simulador/matriz-mejorada.ts`,
> `src/domain/simulador/debounce.ts`) aún no existen.
>
> Esta es la fase RED. La fase IMPL se delega en un agente separado.
> Los tests actualmente fallan al compilar.

---

## REQs cubiertos

| REQ       | Historia de usuario  | Alcance en este slice                                                                                          |
| --------- | -------------------- | -------------------------------------------------------------------------------------------------------------- |
| **REQ-401** | HU-401 (Simulador)   | Filtro de gastos no esenciales (naturaleza `No necesario` / `No tan necesario`).                             |
| **REQ-402** | HU-402 (Recálculo)   | Debounce + flush-on-close de la persistencia de propuestas del Simulador.                                       |
| **REQ-403** | HU-403 (Mejorado)    | Left join entre `Transacciones` y `Simulador` para generar el presupuesto mejorado.                            |

Las dependencias de los REQs (REQ-202 transacciones, REQ-203
normalización, REQ-301 agregación SUMIFS, REQ-603 multi-perfil) ya
están testeadas y aprobadas en slices anteriores.

---

## Archivos de tests creados

| Archivo                                                        | Cantidad de tests | Módulo target                                                       |
| -------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------- |
| `src-tauri/tests/simulador_repo_test.rs`                       | 5                 | `crate::simulador::repo` (NO existe — T-402 + T-403 backend)        |
| `src/domain/simulador/__tests__/filtro.test.ts`                | 5                 | `src/domain/simulador/filtro.ts` (NO existe — T-401)                |
| `src/domain/simulador/__tests__/matriz-mejorada.test.ts`       | 6                 | `src/domain/simulador/matriz-mejorada.ts` (NO existe — T-404)       |
| `src/domain/simulador/__tests__/debounce.test.ts`              | 5                 | `src/domain/simulador/debounce.ts` (NO existe — T-402 frontend)     |
| **Total**                                                      | **21 tests**      |                                                                     |

---

## Detalle por test file

### 1. `simulador_repo_test.rs` (Rust)

**Propósito**: pin del contrato backend del Simulador. Cubre el
CRUD mínimo necesario para que el frontend pueda persistir y
recuperar propuestas de mejora por transacción.

| Test                                                      | Comportamiento esperado                                                                    |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `req_402_repo_inserts_simulacion_for_transaccion`         | `upsert(transaccion_id, nuevo_valor_centavos)` inserta una fila y devuelve su id.          |
| `req_402_repo_updates_simulacion_in_place`                | Un segundo `upsert` para la misma `transaccion_id` actualiza in place (no duplica filas). |
| `req_402_repo_lists_simulaciones_for_user`                | `list_by_user(usuario_id)` retorna simulaciones JOINeadas con `concepto` y `categoria_nombre`. |
| `req_402_repo_rejects_negative_nuevo_valor`               | `upsert(... -1)` falla por el CHECK constraint `>= 0` de la columna.                       |
| `req_402_repo_deletes_simulacion_on_user_request`         | `delete(transaccion_id)` remueve la propuesta; la transacción base queda intacta.          |

**Estado esperado al correr**: **FALLA al compilar** — el módulo
`src-tauri/src/simulador/repo.rs` no existe todavía (y
`pub mod simulador;` no está declarado en `lib.rs`). RED esperada.

### 2. `filtro.test.ts` (TypeScript)

**Propósito**: filtro puro que aísla los gastos susceptibles de
ser mejorados (`No necesario` / `No tan necesario`). Es la
abstracción más simple del slice y se reutiliza tanto por
`PanelSimulador` como por `calcularMatrizMejorada`.

| Test                                              | Escenario validado                                                                   |
| ------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `req_401_filtro_incluye_No_necesario`             | Gasto con `naturaleza_necesidad='No necesario'` retorna `true`.                      |
| `req_401_filtro_incluye_No_tan_necesario`         | Gasto con `naturaleza_necesidad='No tan necesario'` retorna `true`.                  |
| `req_401_filtro_excluye_Necesario`                | Gasto con `naturaleza_necesidad='Necesario'` retorna `false`.                        |
| `req_401_filtro_excluye_Ingreso`                  | Ingreso (independientemente de `naturaleza_necesidad`) retorna `false`.             |
| `req_401_filtro_retorna_solo_no_esenciales`        | Una lista mixta retorna solo los gastos no esenciales (orden preservado, sin mutar). |

**Estado esperado al correr**: **FALLA al import** — el módulo
`src/domain/simulador/filtro.ts` no existe todavía. RED esperada.

### 3. `matriz-mejorada.test.ts` (TypeScript)

**Propósito**: contrato más importante del slice. La
`calcularMatrizMejorada` reemplaza el `valor_centavos` mensual de
cada gasto simulado por su propuesta, dejando intactos Ingresos y
gastos no simulados. Incluye el golden test contra el dataset de
32 transacciones del Excel.

| Test                                                       | Escenario validado                                                                          |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `req_403_matriz_mejorada_reemplaza_gasto_simulado`        | Un gasto de $300k con simulación de $100k → matriz usa $100k.                              |
| `req_403_matriz_mejorada_preserva_gasto_no_simulado`      | Un gasto de $200k sin simulación → matriz usa $200k.                                       |
| `req_403_matriz_mejorada_no_toca_ingresos`                | Un Ingreso con `Simulacion` asociada (defensivo) → matriz usa el valor base.               |
| `req_403_matriz_mejorada_reduce_flujo_caja_libre_negativo`| Dataset sintético con base FCL negativo → improved FCL refleja exactamente el delta.        |
| `req_403_matriz_mejorada_diferencia_es_ahorro_total`      | `base − improved` = suma de `(base − new)` por cada simulación.                            |
| `req_403_matriz_mejorada_golden_32_rows`                  | Las 32 transacciones + 12 simulaciones del Excel → `totalGastos = 6,275,000` (golden).     |

**Estado esperado al correr**: **FALLA al import** — el módulo
`src/domain/simulador/matriz-mejorada.ts` no existe todavía.
RED esperada.

> **Nota sobre el golden test**: el valor esperado
> `totalGastos = 6,275,000.00` viene directamente de
> `PRESUPUESTO MEJORADO!L23` en el Excel fuente (ver
> `docs/analisis-plantilla-financiera.md` §3.5 y §6.2
> discrepancia 2). La diferencia contra la base
> `8,345,000 − 6,275,000 = 2,070,000` coincide con
> `OPORTUNIDADES DE MEJORA!C13` (Total Ahorro mensual).

### 4. `debounce.test.ts` (TypeScript)

**Propósito**: utilidad de debounce + flush-on-close usada por
`FilaSimulador` (panel) y `useFlushOnClose` (hook). Permite
coalescer cambios en vuelo y drenarlos al cerrar la ventana.

| Test                                                  | Escenario validado                                                              |
| ----------------------------------------------------- | ------------------------------------------------------------------------------- |
| `req_402_debounce_delays_call_by_delay`               | `call(x)` + avance < `delayMs` ⇒ `fn` no se invoca.                            |
| `req_402_debounce_invokes_after_delay`               | `call(x)` + avance ≥ `delayMs` ⇒ `fn` se invoca una vez con `x`.              |
| `req_402_debounce_coalesces_multiple_calls`          | 3 `call` rápidos ⇒ `fn` se invoca una sola vez con el último valor.            |
| `req_402_debounce_flush_invokes_immediately`         | `call(x)` + `flush()` antes del delay ⇒ `fn(x)` sincrónico; el timer se cancela. |
| `req_402_debounce_cancel_prevents_pending_call`      | `call(x)` + `cancel()` ⇒ el delay puede transcurrir sin invocar `fn`.          |

**Estado esperado al correr**: **FALLA al import** — el módulo
`src/domain/simulador/debounce.ts` no existe todavía.
RED esperada.

---

## Decisiones de pin (interfaces y firmas)

```rust
// src-tauri/src/simulador/repo.rs
pub struct SimulacionInput {
    pub transaccion_id: i64,
    pub nuevo_valor_centavos: i64,
}

pub struct Simulacion {
    pub id: i64,
    pub transaccion_id: i64,
    pub nuevo_valor_centavos: i64,
    pub created_at: i64,
    pub updated_at: i64,
    // JOINed:
    pub concepto: String,
    pub categoria_id: i64,
    pub categoria_nombre: String,
}

pub fn upsert(conn: &Connection, s: &SimulacionInput) -> rusqlite::Result<i64>
pub fn list_by_user(conn: &Connection, usuario_id: i64) -> rusqlite::Result<Vec<Simulacion>>
pub fn delete(conn: &Connection, transaccion_id: i64) -> rusqlite::Result<()>
```

```ts
// src/domain/simulador/filtro.ts
export function esGastoNoEsencial(t: Transaccion): boolean
export function filtrarGastosNoEsenciales(transacciones: Transaccion[]): Transaccion[]
```

```ts
// src/domain/simulador/matriz-mejorada.ts
export interface Simulacion {
  transaccion_id: number
  nuevo_valor_centavos: number  // MONTHLY value in centavos
}

export function calcularMatrizMejorada(
  transacciones: TransaccionMin[],
  categorias: CategoriaMin[],
  simulaciones: Simulacion[],
): MatrizPresupuesto
```

```ts
// src/domain/simulador/debounce.ts
export interface DebouncedCallback<T> {
  call(value: T): void
  flush(): void
  cancel(): void
}

export function createDebouncedCallback<T>(
  fn: (value: T) => void | Promise<void>,
  delayMs: number,
): DebouncedCallback<T>
```

> **Nota sobre `matriz-mejorada`**: el input `TransaccionMin` viene
> del slice 4 y NO incluye `id`. El IMPL del slice 5 necesitará
> aceptar un row con `id` (lo modelamos en los tests como
> `TransaccionMin & { id: number }`). Si el IMPL quiere evitar
> contaminar el tipo compartido, puede declarar un
> `TransaccionConId extends TransaccionMin { id: number }` local
> al módulo `matriz-mejorada.ts`. Cualquiera de las dos formas es
> aceptable; el contrato observable (los totales) es lo que se valida.

---

## Comandos para verificar la RED

Desde la raíz del proyecto:

```bash
# TypeScript — debe fallar con "Failed to resolve import '..'" en los
# 3 archivos nuevos del slice 5.
pnpm test 2>&1 | tail -10

# Rust — debe fallar al compilar el test target con "cannot find
# `simulador` in `app_diagnostico_financiero_local_lib`".
cd src-tauri && cargo test --no-run --test simulador_repo_test 2>&1 | tail -10
```

Resultado esperado:

- **pnpm test**: `Test Files 3 failed | 8 passed (11)` — los 3
  nuevos files fallan al import; los 8 previos (incluyendo el
  golden-mvp.test.ts de slice 4) pasan.
- **cargo test --no-run --test simulador_repo_test**: error de
  compilación con `cannot find 'simulador' in
  'app_diagnostico_financiero_local_lib'`.

---

## Acceptance criteria para fase IMPL

La fase IMPL (siguiente agente) debe:

1. Crear `src-tauri/src/simulador/repo.rs` exportando
   `SimulacionInput`, `Simulacion`, `upsert`, `list_by_user` y
   `delete`. Agregar `pub mod simulador;` a `src-tauri/src/lib.rs`.
2. Crear `src/domain/simulador/filtro.ts` exportando
   `esGastoNoEsencial` y `filtrarGastosNoEsenciales`. Función pura,
   sin React ni Tauri.
3. Crear `src/domain/simulador/matriz-mejorada.ts` exportando
   `Simulacion` y `calcularMatrizMejorada`. Debe reusar
   `calcularMatriz` de `domain/agregaciones/matriz.ts` y
   `filtrarGastosNoEsenciales` de `filtro.ts`.
4. Crear `src/domain/simulador/debounce.ts` exportando
   `DebouncedCallback` y `createDebouncedCallback`. Implementación
   basada en `setTimeout` / `clearTimeout`.
5. Toda la aritmética monetaria va por `Decimal` (no `Number`).
6. Después del IMPL, los 21 tests del slice 5 deben pasar en
   verde: el golden test de `matriz-mejorada.test.ts` con cierre al
   centavo contra el Excel.

---

## Riesgos identificados

- **`matriz-mejorada` y el tipo de `id`**: el slice 4 no expone `id`
  en `TransaccionMin`. El IMPL debe decidir si extiende el tipo
  compartido o declara un tipo local con `id`. Cualquier camino es
  aceptable; el golden test no distingue entre los dos.
- **`upsert` vs `insert` + `ON CONFLICT`**: la semántica pedida por
  los tests es "upsert en place, sin duplicados". El IMPL puede
  usar `INSERT … ON CONFLICT(transaccion_id) DO UPDATE` o
  `INSERT OR REPLACE`; ambos satisfacen el contrato. El test
  `req_402_repo_updates_simulacion_in_place` acepta cualquiera
  siempre que el `COUNT(*)` siga siendo 1.
- **Precisión decimal en el golden**: el cálculo del improved
  `totalGastos = 6,275,000` depende de que la división
  `valor_centavos / divisor[frecuencia]` se haga con `Decimal`
  (32 dígitos + ROUND_HALF_EVEN) y NO con `Number`. El IMPL debe
  seguir el patrón del slice 4 (importar `Decimal` de
  `domain/precision/money`).
- **`debounce.test.ts` y fake timers**: el IMPL debe basarse en
  `setTimeout` / `clearTimeout` (los fake timers de Vitest mockean
  esos globals). Si el IMPL usa `queueMicrotask` o `requestIdleCallback`,
  los tests fallarán.