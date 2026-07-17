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
  // `| null | undefined` accepts BOTH the JSON `null` that the Rust
  // backend emits (rusqlite projects SQL `NULL` as serde null) AND the
  // strict-TS `undefined` that `TransaccionMin` (in
  // `domain/agregaciones/matriz.ts`) uses for "absent". This makes the
  // DTO assignable to `TransaccionMin` without `as never` casts at the
  // call sites (REQ-602 / slice 11 bugfix).
  comportamiento: 'Fijo' | 'Variable' | null | undefined
  naturaleza_necesidad: 'Necesario' | 'No tan necesario' | 'No necesario' | null | undefined
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

/**
 * Fila de `Usuarios` proyectada para la UI del selector de perfil.
 *
 * Espejo del `UsuarioDto` en `src-tauri/src/commands.rs`. Los campos
 * vienen en snake_case vía `serde` por defecto — sin transformaciones
 * en la frontera IPC.
 */
export interface UsuarioDto {
  id: number
  nombre: string
  salario_personal_objetivo_centavos: number
  modo_mejorado_activo: boolean
}

/**
 * Input del comando `cmd_crear_perfil`.
 *
 * El frontend lo construye desde el form de "crear perfil nuevo" del
 * selector. `salario_personal_objetivo_centavos` se persiste como i64
 * en la DB (ver `001_inicial.sql`).
 */
export interface CrearPerfilInput {
  nombre: string
  salario_personal_objetivo_centavos: number
}

/**
 * Devuelve TODOS los perfiles disponibles en la DB.
 *
 * El backend ordena por `id ASC` para mantener un orden estable. La UI
 * los mapea 1-a-1 a filas clickeables del `SelectorPerfil`.
 *
 * Contrato IPC: `invoke('cmd_obtener_perfiles')` sin payload (Tauri
 * inyecta `AppHandle` automáticamente del lado Rust).
 */
export async function obtenerPerfiles(): Promise<UsuarioDto[]> {
  return invoke<UsuarioDto[]>('cmd_obtener_perfiles')
}

/**
 * Crea un perfil nuevo.
 *
 * Devuelve el `id` autoincrement asignado por la DB. Si el nombre es
 * vacío, el backend propaga un error (rejection de la promesa) con
 * un mensaje legible — la UI debe envolverlo en try/catch y mostrarlo
 * al usuario.
 *
 * Contrato IPC: `invoke('cmd_crear_perfil', { input })` con `input`
 * envuelto bajo la key `input`, mismo shape que `insertarTransaccion`.
 */
export async function crearPerfil(input: CrearPerfilInput): Promise<number> {
  return invoke<number>('cmd_crear_perfil', { input })
}

/**
 * Devuelve UN perfil por id (lookup 1-a-1).
 *
 * Útil para rehidratar el perfil activo al iniciar la app si el id en
 * `localStorage` ya no existe (ej. la DB se regeneró). La UI debe
 * envolver la llamada en try/catch y, ante `Err`, limpiar el id
 * persistido y volver a mostrar el selector.
 *
 * Contrato IPC: `invoke('cmd_obtener_perfil', { id })` con `id`
 * top-level, mismo shape que `eliminarTransaccion`.
 */
export async function obtenerPerfil(id: number): Promise<UsuarioDto> {
  return invoke<UsuarioDto>('cmd_obtener_perfil', { id })
}

// ===========================================================================
// Slice 11: REQ-602 + REQ-603 — wrappers para los 3 comandos del Simulador.
//
// Las keys de payload usan camelCase para `input` (renombrado por serde
// en el struct `UpsertSimulacionInput` del lado Rust) y top-level snake_case
// o camelCase según el binding del comando:
//   * `obtenerSimulaciones(usuarioId)`   → `{ usuarioId }`   (camelCase)
//   * `upsertSimulacion(input)`          → `{ input: {...} }` (camelCase)
//   * `eliminarSimulacion(transaccionId)` → `{ transaccionId }` (camelCase)
//
// Los nombres en camelCase se pinean en el test de slice 11
// (`tauri-commands.test.ts` §REQ-602) — coinciden con la convención
// que `serde` aplica automáticamente al deserializar `UpsertSimulacionInput`.
// ===========================================================================

/**
 * Fila de la tabla `Simulador` (propuesta) proyectada al frontend.
 *
 * Incluye `usuario_id` (espejo de la FK, sin JOIN en TS) para que la UI
 * pueda correlacionar la propuesta con el `transaccion_id` padre sin
 * pedirlo aparte. `created_at`/`updated_at` son epoch UNIX en segundos
 * (mismo formato que `Transacciones.created_at/updated_at`).
 */
export interface SimulacionCompletaDto {
  id: number
  usuario_id: number
  transaccion_id: number
  nuevo_valor_centavos: number
  created_at: number
  updated_at: number
}

/**
 * Input que la UI envía al backend al crear o actualizar una propuesta
 * del Simulador.
 *
 * El backend (`UpsertSimulacionInput` en `commands.rs`) acepta un
 * struct `serde(Deserialize, rename_all = "camelCase")`, así que las
 * keys del payload son camelCase — eso es lo que llega al backend vía
 * la frontera IPC de Tauri v2.
 */
export interface UpsertSimulacionInput {
  transaccionId: number
  nuevoValorCentavos: number
  usuarioId: number
}

/**
 * Lista todas las propuestas de Simulador del usuario indicado.
 *
 * Devuelve un array vacío si el usuario todavía no creó ninguna
 * propuesta (estado inicial habitual). El backend ordena por
 * `transaccion_id ASC` para mantener un orden estable.
 *
 * Contrato IPC: `invoke('cmd_listar_simulaciones', { usuarioId })`
 * con `usuarioId` como top-level key.
 */
export async function obtenerSimulaciones(
  usuarioId: number,
): Promise<SimulacionCompletaDto[]> {
  return invoke<SimulacionCompletaDto[]>('cmd_listar_simulaciones', {
    usuarioId,
  })
}

/**
 * Crea o actualiza la propuesta del Simulador para una transacción.
 *
 * Si ya existe una propuesta para `input.transaccionId`, el backend
 * hace un UPSERT (`ON CONFLICT DO UPDATE`) — el mismo `id` se mantiene
 * y solo se refresca `nuevoValorCentavos` + `updated_at`. La UI debe
 * refrescar la lista después para reflejar el cambio.
 *
 * Devuelve el `id` autoincrement de la propuesta (útil si la UI
 * quiere optimista-tracking antes del refetch).
 *
 * Contrato IPC: `invoke('cmd_upsert_simulacion', { input: {...} })`
 * con `input` envuelto bajo la key `input`, mismo shape que
 * `insertarTransaccion` y `crearPerfil`.
 */
export async function upsertSimulacion(input: UpsertSimulacionInput): Promise<number> {
  return invoke<number>('cmd_upsert_simulacion', { input })
}

/**
 * Elimina la propuesta del Simulador para la transacción dada.
 *
 * Es no-op si no existe propuesta para esa transacción (la semántica
 * de `repo::delete` es "0 filas = éxito válido"). La UI debe refrescar
 * la lista para reflejar el cambio.
 *
 * Contrato IPC: `invoke('cmd_eliminar_simulacion', { transaccionId })`
 * con `transaccionId` como top-level key.
 */
export async function eliminarSimulacion(transaccionId: number): Promise<void> {
  await invoke<void>('cmd_eliminar_simulacion', { transaccionId })
}
