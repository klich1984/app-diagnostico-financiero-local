// tauri-commands.ts — Wrappers tipados sobre los comandos IPC de Rust.
//
// Ver `spec.md` §REQ-202 (escenarios de inserción / listado / catálogo)
// y `design.md` §7 (capa React, Atomic Design). Estos wrappers son la
// ÚNICA superficie que la UI usa para hablar con el backend: nunca se
// llama a `invoke()` directo desde un componente.
//
// ## Contrato con el backend (Slice 7)
// Cada `invoke<…>` acá mapea 1-a-1 a un `#[tauri::command]` registrado en
// `src-tauri/src/lib.rs`:
//
//   * `obtenerCategorias()`     → `cmd_obtener_categorias`
//   * `insertarTransaccion(input)` → `cmd_insert_transaccion` (payload: { input })
//   * `listarTransacciones()`   → `cmd_listar_transacciones`  (SIN payload)
//   * `eliminarTransaccion(id)`   → `cmd_eliminar_transaccion` (payload: { id })
//
// NOTA slice 7: `listarTransacciones()` no recibe `usuario_id`. La
// resolución del perfil activo vive en el backend (CRUD abierto en el
// Épica 5 — selector al abrir). El front queda libre de plumbing de
// perfiles, alineado con la decisión de producto #6.
//
// ## Por qué mockear `@tauri-apps/api/core` en los tests
// En la WebView real, `invoke` habla al binario Tauri por IPC. En
// jsdom no existe ese canal; mockear `invoke` con `vi.mock` nos deja
// assertar el contrato (nombre del comando + shape del payload) sin
// levantar el runtime de Tauri, manteniendo los tests de Vitest rápidos
// y deterministas.

import { invoke } from '@tauri-apps/api/core'

/**
 * Fila de `Categorias` proyectada para el dropdown de la UI.
 *
 * `grupo_pertenencia` coincide con el tipo `CategoriaOption.tipo_flujo`
 * del `TransaccionForm` (TitleCase: 'Ingreso' | 'Gasto'). El form puede
 * mapear 1-a-1 sin transformar.
 */
export interface CategoriaDto {
  id: number
  nombre: string
  grupo_pertenencia: 'Ingreso' | 'Gasto'
}

/**
 * Input "crudo" que la UI envía al backend al guardar una transacción.
 *
 * Espejo exacto de `crate::transacciones::repo::TransaccionInput` del
 * lado Rust — los nombres de campos coinciden (snake_case) para que
 * Tauri's IPC serializer no necesite transformaciones.
 *
 * `usuario_id` NO se incluye aquí: el backend lo resuelve vía
 * `resolver_usuario_activo()` antes de invocar `repo::insert`. Esto
 * es coherente con la decisión de producto #6 (multi-perfil con
 * selector al abrir) — la UI no necesita saber qué perfil está
 * activo; eso es responsabilidad del backend.
 */
export interface TransaccionInputDto {
  tipo_flujo: 'Ingreso' | 'Gasto'
  categoria_id: number
  concepto: string
  frecuencia: 'Mensual' | 'Bimensual' | 'Trimestral' | 'Semestral' | 'Anual'
  comportamiento: 'Fijo' | 'Variable' | null
  naturaleza_necesidad: 'Necesario' | 'No tan necesario' | 'No necesario' | null
  valor_centavos: number
}

/**
 * Fila hidratada de `Transacciones` devuelta por el backend.
 *
 * Incluye `categoria_nombre` (JOIN con `Categorias` en
 * `repo::list_by_user`) para que la UI pueda mostrar el nombre de la
 * categoría sin pedirlo por separado. Los timestamps son epoch UNIX en
 * segundos (mismo formato que `created_at`/`updated_at` en SQL).
 */
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

/**
 * Devuelve el catálogo completo de categorías (14 filas: 4 Ingreso +
 * 10 Gasto, sembradas por la migración inicial).
 *
 * El orden lo fija el backend (`Categorias.id ASC`). La UI puede asumir
 * que el orden es estable entre invocaciones, y filtrar por
 * `grupo_pertenencia` para poblar el dropdown dependiente del form.
 */
export async function obtenerCategorias(): Promise<CategoriaDto[]> {
  return invoke<CategoriaDto[]>('cmd_obtener_categorias')
}

/**
 * Persiste una transacción nueva en la DB SQLite local.
 *
 * Devuelve el `id` autoincrement asignado por la DB. Cualquier violación
 * de CHECK constraint (p.ej. `valor_centavos = 0`) se propaga como
 * `Error` rechazado por la promesa — la UI debe envolver la llamada en
 * try/catch y mostrar el mensaje al usuario.
 *
 * ## Contrato IPC de Tauri v2
 * Las keys del objeto payload DEBEN coincidir con los nombres de los
 * parámetros del comando Rust. El comando Rust es:
 *
 *     pub async fn cmd_insert_transaccion(
 *         app: tauri::AppHandle,
 *         input: TransaccionInput,
 *     )
 *
 * `app` lo inyecta Tauri automáticamente; `input` lo proveemos nosotros.
 * Por eso el payload va envuelto en `{ input }`, no aplanado.
 */
export async function insertarTransaccion(input: TransaccionInputDto): Promise<number> {
  return invoke<number>('cmd_insert_transaccion', { input })
}

/**
 * Lista las transacciones del perfil activo.
 *
 * El backend resuelve el `usuario_id` activo internamente; la UI no
 * necesita pasarlo. Orden: `created_at DESC, id DESC` (la más reciente
 * primero), igual que el reporte de Excel fuente.
 */
export async function listarTransacciones(): Promise<TransaccionCompletaDto[]> {
  return invoke<TransaccionCompletaDto[]>('cmd_listar_transacciones')
}

/**
 * Elimina una transacción por id.
 *
 * Devuelve `void` en éxito. Si el id no existe, SQLite no hace nada
 * (no es error — `execute` con 0 filas afectadas es un éxito válido
 * en `rusqlite`). La UI debe refrescar la lista después de la llamada
 * para reflejar el cambio.
 *
 * La tabla `Simulador` referencia `Transacciones` con
 * `ON DELETE CASCADE`, así que cualquier propuesta de simulador
 * asociada se limpia automáticamente.
 */
export async function eliminarTransaccion(id: number): Promise<void> {
  await invoke<void>('cmd_eliminar_transaccion', { id })
}
