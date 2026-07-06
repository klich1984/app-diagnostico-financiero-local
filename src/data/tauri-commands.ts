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
//   * `insertarTransaccion(t)`  → `cmd_insert_transaccion`    (payload: `t`)
//   * `listarTransacciones()`   → `cmd_listar_transacciones`  (SIN payload)
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
 * `usuario_id` lo resuelve el backend en slices futuros; en slice 7 el
 * form no lo incluye en el payload.
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
 * de CHECK constraint (p. ej. `valor_centavos = 0`) se propaga como
 * `Error` rechazado por la promesa — la UI debe envolver la llamada en
 * try/catch y mostrar el mensaje al usuario.
 *
 * El payload se serializa en snake_case aplanado para coincidir 1-a-1
 * con los campos de `crate::transacciones::repo::TransaccionInput` del
 * backend Rust. La convención de Tauri v2 trata cada campo del struct
 * como una clave top-level del args object, así que pasamos el `input`
 * directo sin wrapping.
 */
export async function insertarTransaccion(input: TransaccionInputDto): Promise<number> {
  return invoke<number>('cmd_insert_transaccion', input as unknown as Record<string, unknown>)
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
