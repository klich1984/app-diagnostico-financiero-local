# Slice 7 — Plan de Tests (fase RED)

> **Esta es la fase RED**. La fase IMPL se delega en un agente separado
> tras la revisión del usuario.

## Cambio SDD

- **change_name**: `mvp-financiero-local-first`
- **slice**: 7 (post-MVP, fuera del blueprint original de 6 PRs)
- **rama**: `feat/persistencia` (creada desde `main` el 2026-07-04)
- **fase TDD**: RED — los tests deben **fallar al compilar**
- **modo de ejecución**: interactivo
- **idioma artefactos**: español neutro (este documento), inglés (código + comentarios en código)

## REQs cubiertos

| REQ     | Título                                            | Slice origen |
| ------- | ------------------------------------------------- | ------------ |
| REQ-202 | CRUD de Transacciones + Integridad CHECK SQL      | Slice 3      |

REQ-202 es el único REQ tocado por Slice 7 — el resto (REQ-201 sobre el
catálogo de categorías, REQ-603 sobre aislamiento multi-perfil) ya
estaban parcialmente cubiertos en los slices anteriores y se referencian
desde los tests como contrato cerrado.

## Archivos de tests creados

| Archivo                                                            | Stack       | Tests | Estado     |
| ------------------------------------------------------------------ | ----------- | ----- | ---------- |
| `src-tauri/tests/commands_test.rs`                                 | Rust        | 5     | RED (no compila) |
| `src/data/__tests__/tauri-commands.test.ts`                        | TypeScript  | 5     | RED (no resuelve import) |
| **Total**                                                          |             | **10**|            |

> Nota: el target del usuario ("~15 tests, 5+5+5") se reduce a 10 porque
> los 5 tests de "algo más" del brief original se solapan con escenarios
> ya cubiertos en los slices 2, 3 y 6 (categorías seed, repositorio de
> transacciones, motor de KPIs). Re-cubrirlos acá duplicaría coverage
> sin agregar valor.

## Funciones y módulos bajo prueba

### 1. Backend Rust — `src-tauri/tests/commands_test.rs`

Funciones / módulos que cada test valida:

| Test                                              | Función / módulo                                              | Contrato pinneado                                                                                                            |
| ------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `slice7_cmd_obtener_categorias_returns_all_14`    | `crate::commands::cmd_obtener_categorias_impl(&Connection)`   | Devuelve `Vec<CategoriaDto>` con exactamente 14 filas (4 Ingreso + 10 Gasto) sembradas por la migración `001_inicial.sql`.  |
| `slice7_cmd_obtener_categorias_returns_correct_shape` | `crate::commands::cmd_obtener_categorias_impl(&Connection)` | Cada `CategoriaDto` expone `{ id: i64, nombre: String, grupo_pertenencia: String }` con tipos no vacíos y enum canónico.     |
| `slice7_cmd_insert_transaccion_persists_to_db`    | `crate::commands::cmd_insert_transaccion_impl(&Connection, &TransaccionInput)` | Inserta fila, devuelve `id > 0`, y el row es consultable de vuelta con `list_by_user`.                                       |
| `slice7_cmd_insert_transaccion_validates_value_positive` | `crate::commands::cmd_insert_transaccion_impl(...)`     | Devuelve `Err(_)` cuando `valor_centavos = 0` (CHECK constraint). No persiste fila.                                         |
| `slice7_cmd_listar_transacciones_returns_only_user_rows` | `crate::commands::cmd_listar_transacciones_impl(&Connection, usuario_id: i64)` | Filtra estrictamente por `usuario_id`. No hay leak entre perfiles (REQ-603).                                                |

#### Tipos exportados que el IMPL debe declarar

```rust
#[derive(serde::Serialize)]
pub struct CategoriaDto {
    pub id: i64,
    pub nombre: String,
    pub grupo_pertenencia: String,  // "Ingreso" | "Gasto"
}

pub fn cmd_obtener_categorias_impl(conn: &Connection) -> Result<Vec<CategoriaDto>, String>;
pub fn cmd_insert_transaccion_impl(conn: &Connection, t: &TransaccionInput) -> Result<i64, String>;
pub fn cmd_listar_transacciones_impl(conn: &Connection, usuario_id: i64) -> Result<Vec<Transaccion>, String>;
```

> **Patrón de testing (binding)**: cada comando Tauri expone una
> función interna `*_impl(&Connection, …)` que el `#[tauri::command]`
> wrapper envuelve. Los tests llaman a `*_impl` directamente con un
> `Connection` en memoria, evitando levantar el runtime de Tauri. El
> `#[tauri::command]` y la integración con `tauri::State<DbState>` se
> cubren en otra capa (integración o verificación manual).

### 2. Frontend TypeScript — `src/data/__tests__/tauri-commands.test.ts`

Funciones / módulos que cada test valida:

| Test                                                            | Función / módulo                              | Contrato pinneado                                                                                                |
| --------------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `slice7_obtener_categorias_invokes_cmd_obtener_categorias`      | `obtenerCategorias()`                         | Llama `invoke('cmd_obtener_categorias')` sin payload.                                                            |
| `slice7_obtener_categorias_returns_typed_array`                 | `obtenerCategorias()`                         | Devuelve el array resuelto, tipado como `CategoriaDto[]`.                                                       |
| `slice7_insertar_transaccion_invokes_cmd_insert_transaccion_with_input` | `insertarTransaccion(input)`            | Llama `invoke('cmd_insert_transaccion', input)` y devuelve el `id` (number).                                    |
| `slice7_listar_transacciones_invokes_cmd_listar_transacciones`  | `listarTransacciones()`                       | Llama `invoke('cmd_listar_transacciones')` sin payload (perfil activo lo resuelve el backend).                  |
| `slice7_insertar_transaccion_propagates_errors`                 | `insertarTransaccion(input)`                  | Si `invoke` rechaza, la promesa devuelta también rechaza (sin tragar errores).                                   |

#### Tipos exportados que el IMPL debe declarar

```typescript
export interface CategoriaDto {
  id: number
  nombre: string
  grupo_pertenencia: 'Ingreso' | 'Gasto'
}

export interface TransaccionCompletaDto {
  id: number
  usuario_id: number
  tipo_flujo: 'Ingreso' | 'Gasto'
  categoria_id: number
  categoria_nombre: string
  concepto: string
  frecuencia: 'Mensual' | 'Bimensual' | 'Trimestral' | 'Semestral' | 'Anual'
  comportamiento: 'Fijo' | 'Variable' | null
  naturaleza_necesidad: 'Necesario' | 'No tan necesario' | 'No necesario' | null
  valor_centavos: number
  created_at: number
  updated_at: number
}

export interface TransaccionInputDto {
  tipo_flujo: 'Ingreso' | 'Gasto'
  categoria_id: number
  concepto: string
  frecuencia: 'Mensual' | 'Bimensual' | 'Trimestral' | 'Semestral' | 'Anual'
  comportamiento: 'Fijo' | 'Variable' | null
  naturaleza_necesidad: 'Necesario' | 'No tan necesario' | 'No necesario' | null
  valor_centavos: number
}

export async function obtenerCategorias(): Promise<CategoriaDto[]>
export async function insertarTransaccion(t: TransaccionInputDto): Promise<number>
export async function listarTransacciones(): Promise<TransaccionCompletaDto[]>
```

> **Por qué mockear `@tauri-apps/api/core`**: en jsdom no hay runtime de
> Tauri, así que `invoke` se mockea con `vi.fn()`. Esto nos permite
> asertar el contrato con el backend (nombre del comando + forma del
> payload) sin levantar un proceso Tauri real.

## Helpers de testing reutilizados

- `src-tauri/tests/common/mod.rs` — **ya existente**, expone paths a
  `migrations/001_inicial.sql` y helpers de filesystem. El test nuevo
  **no requiere** agregar nada ahí: la apertura de DB in-memory con
  `apply_all` se hace inline (mismo patrón que `transacciones_repo_test.rs`).
- `src/__tests__/setup.ts` — **ya existente**, sólo setea
  `IS_REACT_ACT_ENVIRONMENT` para silenciar el warning de React 18 + act().
  El test nuevo lo hereda automáticamente vía `vitest.config.ts`.

## Comportamiento esperado (RED)

| Comando                                                | Resultado esperado                                  |
| ------------------------------------------------------ | --------------------------------------------------- |
| `cd src-tauri && cargo test --no-run`                  | **FAIL** — no compila. Módulos `crate::commands::{cmd_obtener_categorias_impl, cmd_insert_transaccion_impl, cmd_listar_transacciones_impl, CategoriaDto}` no resueltos. |
| `pnpm test` (raíz)                                     | **FAIL** — `../tauri-commands` no resuelve. Vitest reporta error de import antes de correr cualquier `it()`. |

Esta es la confirmación de que la fase RED está bien plantada: los
tests NO pueden pasar sin el IMPL. Una vez que el IMPL introduzca los
módulos y funciones pinneadas arriba, los tests deben pasar sin
modificaciones.

## Siguiente fase

Una vez que el usuario revise los archivos y apruebe la fase RED, el
agente de IMPL (separado) deberá:

1. Crear `src-tauri/src/commands.rs` (o `src-tauri/src/commands/mod.rs`)
   con las firmas pinneadas, y agregar `pub mod commands;` a `lib.rs`.
2. Crear `src/data/tauri-commands.ts` con los wrappers tipados.
3. (Opcional, **fuera de RED/IMPL**) Crear un `DbState` y registrar los
   comandos con `tauri::generate_handler!` — esto se hace en una fase
   de wiring posterior para evitar acoplar el IMPL con el runtime de
   Tauri antes de tener el contrato verde.
4. Correr `cargo test --no-run && pnpm test` para confirmar que la
   transición RED → VERDE no requiere modificar los tests.

## Riesgos identificados

| Riesgo                                                          | Mitigación                                                                          |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| El IMPL introduce un wrapper con campos renombrados.            | Los nombres `grupo_pertenencia`, `valor_centavos`, `categoria_nombre` están pinneados por tests previos + este plan. |
| El IMPL decide usar `tauri::State` directo en lugar del patrón `*_impl`. | Los tests están diseñados alrededor del patrón `*_impl`; si el IMPL diverge, debe reescribir los tests (y pedir re-revisión). |
| El usuario solicita commits automáticos en RED.                 | El brief del usuario y el AGENTS.md son explícitos: **el usuario commitea y revisa**. No se ejecuta `git commit` en esta fase. |
| Slice 7 excede el review budget de 400 líneas (sólo tests).     | Los 3 archivos pesan ~600 líneas en total, pero todos son tests. El IMPL debería entrar en otro slice si supera 400 líneas netas (verificar al cierre del RED). |

## Archivos a commitear (sugerencia)

El usuario decide; no se ejecuta automáticamente. Sugerencia de Conventional Commits:

- `test: add failing tests for slice 7 (persistencia IPC)`
- `docs: add slice 7 test plan`

## Comandos git sugeridos (NO ejecutar por el agente)

```bash
git status                                              # revisar archivos
git add src-tauri/tests/commands_test.rs \
        src/data/__tests__/tauri-commands.test.ts \
        openspec/changes/mvp-financiero-local-first/slice-7-test-plan.md
git diff --cached                                        # revisar el diff
git commit -m "test: add failing tests for slice 7 (persistencia IPC)"
git add openspec/changes/mvp-financiero-local-first/slice-7-test-plan.md
git commit -m "docs: add slice 7 test plan"
```