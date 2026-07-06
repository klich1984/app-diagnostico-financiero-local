//! Comandos IPC que el frontend React invoca vía `invoke()`.
//!
//! Ver `design.md` §6.1 (capa `commands/`) + §6.2 (contratos IPC) y
//! `spec.md` §REQ-202 (escenarios: "Inserción de nueva transacción",
//! "Listado de transacciones por usuario", "Catálogo de categorías").
//!
//! Cada comando público viene en DOS variantes:
//!   * `cmd_*_impl(&Connection)` — función pura, testeable sin Tauri.
//!     Recibe la conexión ya abierta; corre SQL puro; devuelve `Result`.
//!     Es la superficie que cubren los tests de integración de slice 7.
//!   * `cmd_*` decorado con `#[tauri::command]` — wrapper `async` que
//!     recibe el `AppHandle`, resuelve `db::abrir_conexion`, y delega
//!     en la variante `*_impl`. Esta es la función que se registra en
//!     `tauri::generate_handler!` dentro de `lib.rs`.
//!
//! Separar `_impl` del wrapper es deliberado: los tests unitarios del
//! backend pueden cubrir la lógica SQL sin levantar el runtime de Tauri
//! (que requiere un display, un main loop async y emparejar la versión
//! exacta del binario). Mantener el wrapper delgado y la lógica en
//! `_impl` nos da:
//!   * tests rápidos (`cargo test`) sin GUI;
//!   * un único lugar para tocar cuando cambian las reglas SQL;
//!   * type-safety end-to-end (el `#[tauri::command]` se compila contra
//!     los mismos structs que `db::abrir_conexion` abre).
//!
//! ## Resolver de usuario activo
//!
//! Para `cmd_listar_transacciones` (que el frontend llama SIN pasar
//! `usuario_id`), el backend necesita saber qué perfil está mirando
//! el usuario. La estrategia mínima viable en este slice (sin estado
//! global ni selector de perfil todavía) es: tomar el `Usuarios` de
//! menor `id` — el primero que el seed o el usuario creó. Cuando se
//! implemente el selector de perfil (Épica 5), este resolver se
//! reemplaza por `cmd_obtener_usuario_activo` sin tocar la API pública
//! del comando.

use crate::db;
use crate::transacciones::repo::{self, Transaccion, TransaccionInput};
use rusqlite::Connection;

/// DTO que ve la capa React para cada `Categoria` del catálogo.
///
/// El campo `grupo_pertenencia` se llama así (no `tipo_flujo`) para
/// coincidir con el nombre que el `TransaccionForm.CategoriaOption`
/// consume (`tipo_flujo`). El rename mantiene el contrato estable
/// entre Rust y TS sin obligar al form a hacer una transformación.
#[derive(serde::Serialize, Clone, Debug)]
pub struct CategoriaDto {
    pub id: i64,
    pub nombre: String,
    pub grupo_pertenencia: String,
}

/// Devuelve TODAS las categorías semilla (14: 4 Ingreso + 10 Gasto).
///
/// Orden estable por `id` ASC para que el dropdown de la UI presente
/// siempre el mismo orden. La Selección, filtrado y traducción a
/// `CategoriaOption` ocurren del lado React.
pub fn cmd_obtener_categorias_impl(conn: &Connection) -> Result<Vec<CategoriaDto>, String> {
    let mut stmt = conn
        .prepare("SELECT id, nombre, tipo_flujo FROM Categorias ORDER BY id ASC")
        .map_err(|e| format!("preparing SELECT Categorias: {e}"))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(CategoriaDto {
                id: row.get(0)?,
                nombre: row.get(1)?,
                grupo_pertenencia: row.get(2)?,
            })
        })
        .map_err(|e| format!("querying Categorias: {e}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("collecting Categorias rows: {e}"))?;

    Ok(rows)
}

/// Wrapper IPC: resuelve la conexión vía `db::abrir_conexion` y delega.
#[tauri::command]
pub async fn cmd_obtener_categorias(app: tauri::AppHandle) -> Result<Vec<CategoriaDto>, String> {
    let conn = db::abrir_conexion(&app)?;
    cmd_obtener_categorias_impl(&conn)
}

/// Inserta una nueva transacción y devuelve el `id` asignado.
///
/// # Errores
/// Propaga cualquier violación de CHECK (`valor_centavos > 0`,
/// `frecuencia` no válida, cross-column `tipo_flujo` vs comportamiento
/// o naturaleza_necesidad, FK inválida) sin envolver, como `String`,
/// para que el frontend muestre el mensaje al usuario.
pub fn cmd_insert_transaccion_impl(
    conn: &Connection,
    t: &TransaccionInput,
) -> Result<i64, String> {
    repo::insert(conn, t).map_err(|e| format!("inserting Transaccion: {e}"))
}

#[tauri::command]
pub async fn cmd_insert_transaccion(
    app: tauri::AppHandle,
    input: TransaccionInput,
) -> Result<i64, String> {
    let conn = db::abrir_conexion(&app)?;
    cmd_insert_transaccion_impl(&conn, &input)
}

/// Devuelve las transacciones del usuario indicado.
///
/// El orden lo define `repo::list_by_user` (`created_at DESC, id DESC`).
pub fn cmd_listar_transacciones_impl(
    conn: &Connection,
    usuario_id: i64,
) -> Result<Vec<Transaccion>, String> {
    repo::list_by_user(conn, usuario_id).map_err(|e| format!("listing Transacciones: {e}"))
}

/// Resuelve el `id` del primer `Usuarios` insertado (menor `id`).
///
/// Estrategia de mínimo costo para slice 7: existe UN perfil semilla
/// cuando la DB es nueva (no se inserta ninguno automáticamente —
/// el `INSERT INTO Usuarios` lo hace la capa de UI en algún slice
/// futuro). Si la tabla está vacía, devolvemos `Err` claro. Cuando
/// se implemente el selector de perfil (Épica 5), este resolver
/// se reemplaza sin tocar `cmd_listar_transacciones_impl`.
fn resolver_usuario_activo(conn: &Connection) -> Result<i64, String> {
    conn.query_row(
        "SELECT id FROM Usuarios ORDER BY id ASC LIMIT 1",
        [],
        |row| row.get::<_, i64>(0),
    )
    .map_err(|e| format!("resolving active usuario: {e}"))
}

/// Wrapper IPC: resuelve el usuario activo y delega en `_impl`.
#[tauri::command]
pub async fn cmd_listar_transacciones(
    app: tauri::AppHandle,
) -> Result<Vec<Transaccion>, String> {
    let conn = db::abrir_conexion(&app)?;
    let usuario_id = resolver_usuario_activo(&conn)?;
    cmd_listar_transacciones_impl(&conn, usuario_id)
}
