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
//! Para `cmd_listar_transacciones` y `cmd_insert_transaccion` (que el
//! frontend llama SIN pasar `usuario_id`), el backend necesita saber
//! qué perfil está mirando el usuario. La estrategia mínima viable en
//! este slice (sin estado global ni selector de perfil todavía) es
//! resolver por nombre — el seed en `001_inicial.sql` garantiza la
//! existencia del usuario 'Yo' (`INSERT OR IGNORE`), y este resolver
//! lo encuentra por `SELECT id FROM Usuarios WHERE nombre = 'Yo'`.
//! Cuando se implemente el selector de perfil (decision de producto #6,
//! slices futuros), ambos resolvers se reemplazan por
//! `cmd_obtener_usuario_activo` sin tocar la API pública del comando.

use crate::db;
use crate::simulador::repo::SimulacionInput;
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
///
/// NOTA: el `TransaccionInput` llega con `usuario_id` ya resuelto por
/// el command wrapper (`cmd_insert_transaccion`). Este `_impl` no
/// resuelve nada — confía en el contrato.
pub fn cmd_insert_transaccion_impl(
    conn: &Connection,
    t: &TransaccionInput,
) -> Result<i64, String> {
    repo::insert(conn, t).map_err(|e| format!("inserting Transaccion: {e}"))
}

/// Resuelve el `usuario_id` activo para el comando actual.
///
/// Slice 7 (MVP local): retorna el id del usuario 'Yo' (creado por el
/// seed en `001_inicial.sql`). Cuando exista el selector de perfil
/// (decision de producto #6, slices futuros), este helper leerá la
/// sesión activa desde el estado de Tauri (vía `tauri::State`) y ya
/// no abrirá la conexión acá — solo delegará en el `cmd_obtener_usuario_activo`.
fn resolver_usuario_activo(app: &tauri::AppHandle) -> Result<i64, String> {
    let conn = db::abrir_conexion(app)?;
    conn.query_row(
        "SELECT id FROM Usuarios WHERE nombre = ?1 LIMIT 1",
        ["Yo"],
        |row| row.get::<_, i64>(0),
    )
    .map_err(|e| format!("resolver_usuario_activo: no user 'Yo' found: {e}"))
}

#[tauri::command]
pub async fn cmd_insert_transaccion(
    app: tauri::AppHandle,
    mut input: TransaccionInput,
) -> Result<i64, String> {
    let usuario_id = resolver_usuario_activo(&app)?;
    input.usuario_id = Some(usuario_id);
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
/// Estrategia de mínimo costo para slice 7: la seed migration inserta
/// UN perfil llamado 'Yo' en `001_inicial.sql`. Tomamos el de menor
/// `id` por robustez (si en el futuro la seed agrega más perfiles,
/// este resolver sigue funcionando). Si la tabla está vacía,
/// devolvemos `Err` claro. Cuando se implemente el selector de
/// perfil (Épica 5), este resolver se reemplaza sin tocar
/// `cmd_listar_transacciones_impl`.
///
/// NOTA: este resolver vive sólo para `cmd_listar_transacciones`
/// (lee de la DB). El resolver que usa `cmd_insert_transaccion` es
/// `resolver_usuario_activo(&AppHandle)` y resuelve por nombre — son
/// dos helpers con propósitos distintos (este lee de un `&Connection`
/// ya abierto; el otro abre la conexión vía `AppHandle`).
fn resolver_usuario_activo_desde_db(conn: &Connection) -> Result<i64, String> {
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
    let usuario_id = resolver_usuario_activo_desde_db(&conn)?;
    cmd_listar_transacciones_impl(&conn, usuario_id)
}

/// Elimina una transacción por id (hard delete).
///
/// Si el id no existe, SQLite no falla — `execute` devuelve 0 filas
/// afectadas pero NO es un error. Esto es coherente con la semántica
/// de `repo::delete` y `rusqlite::Connection::execute`. La UI debe
/// refrescar la lista después de la llamada para reflejar el cambio.
///
/// La tabla `Simulador` referencia `Transacciones` con
/// `ON DELETE CASCADE`, así que cualquier propuesta de simulador
/// asociada se limpia automáticamente (ver `repo::delete`).
pub fn cmd_eliminar_transaccion_impl(conn: &Connection, id: i64) -> Result<(), String> {
    repo::delete(conn, id).map_err(|e| format!("eliminando Transaccion: {e}"))
}

/// Wrapper IPC: abre la conexión y delega en `cmd_eliminar_transaccion_impl`.
#[tauri::command]
pub async fn cmd_eliminar_transaccion(app: tauri::AppHandle, id: i64) -> Result<(), String> {
    let conn = db::abrir_conexion(&app)?;
    cmd_eliminar_transaccion_impl(&conn, id)
}

// ===========================================================================
// Slice 9: REQ-501 (selector multi-perfil) + REQ-603 (soporte multi-perfil).
// ===========================================================================
//
// Tres comandos nuevos para el ciclo "selector al abrir":
//
//   * `cmd_obtener_perfiles` — devuelve TODOS los `Usuarios` (ordenados por
//     `id` ASC para mantener un orden estable en la UI).
//   * `cmd_crear_perfil`    — inserta un `Usuarios` nuevo. El CHECK
//     `length(trim(nombre)) > 0` se valida tanto del lado del `_impl`
//     (rechazo temprano con mensaje claro) como del lado SQL
//     (defensa en profundidad).
//   * `cmd_obtener_perfil`  — lookup 1-a-1 por id, devuelve un `UsuarioDto`.
//
// Decisión de producto #6 (multi-perfil con selector al abrir): el selector
// se muestra al abrir la app. La persistencia del perfil activo se hace
// del lado frontend (localStorage del WebView); un slice futuro agregará
// la tabla `Sesion` o equivalente en el backend si la decisión cambia.
//
// ===========================================================================

/// DTO que la capa React consume para cada `Usuarios`.
///
/// Los campos son espejos 1-a-1 de la tabla (snake_case en el JSON vía
/// `serde` por defecto) para evitar transformaciones en la frontera IPC.
#[derive(serde::Serialize, Clone, Debug)]
pub struct UsuarioDto {
    pub id: i64,
    pub nombre: String,
    pub salario_personal_objetivo_centavos: i64,
    pub modo_mejorado_activo: bool,
}

/// Devuelve TODOS los perfiles (`Usuarios`) de la DB.
///
/// Orden estable por `id` ASC para que el selector presente siempre el
/// mismo orden. El frontend mapea a una lista clickeable.
pub fn cmd_obtener_perfiles_impl(conn: &Connection) -> Result<Vec<UsuarioDto>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, nombre, salario_personal_objetivo_centavos, modo_mejorado_activo \
             FROM Usuarios ORDER BY id ASC",
        )
        .map_err(|e| format!("preparing SELECT Usuarios: {e}"))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(UsuarioDto {
                id: row.get(0)?,
                nombre: row.get(1)?,
                salario_personal_objetivo_centavos: row.get(2)?,
                // `modo_mejorado_activo` se almacena como INTEGER 0/1 en SQL;
                // lo proyectamos a bool explícitamente para evitar surprises
                // con `serde` (que interpretaría i64 como número).
                modo_mejorado_activo: row.get::<_, i64>(3)? != 0,
            })
        })
        .map_err(|e| format!("querying Usuarios: {e}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("collecting Usuarios rows: {e}"))?;

    Ok(rows)
}

/// Wrapper IPC: resuelve la conexión vía `db::abrir_conexion` y delega.
#[tauri::command]
pub async fn cmd_obtener_perfiles(app: tauri::AppHandle) -> Result<Vec<UsuarioDto>, String> {
    let conn = db::abrir_conexion(&app)?;
    cmd_obtener_perfiles_impl(&conn)
}

/// Input del comando `cmd_crear_perfil`.
///
/// Se modela como struct dedicado (en vez de pasar `(nombre, salario)`
/// sueltos) para mantener consistencia con `cmd_insert_transaccion` que
/// ya recibe un `TransaccionInput`. Tauri v2 mapea las keys del payload
/// JSON a los campos del struct por nombre.
#[derive(serde::Deserialize)]
pub struct CrearPerfilInput {
    pub nombre: String,
    pub salario_personal_objetivo_centavos: i64,
}

/// Inserta un `Usuarios` nuevo y devuelve el id asignado.
///
/// Rechaza `nombre` vacío / whitespace-only con un mensaje claro (el
/// CHECK `length(trim(nombre)) > 0` lo haría fallar en SQL, pero
/// devolvemos un error más legible). El salario se persiste tal cual —
/// la validación de `salario_personal_objetivo_centavos >= 0` la hace
/// la tabla via CHECK.
pub fn cmd_crear_perfil_impl(
    conn: &Connection,
    nombre: String,
    salario_personal_objetivo_centavos: i64,
) -> Result<i64, String> {
    let nombre_trimmed = nombre.trim();
    if nombre_trimmed.is_empty() {
        return Err("el nombre del perfil es obligatorio".to_string());
    }

    conn.execute(
        "INSERT INTO Usuarios (nombre, salario_personal_objetivo_centavos) VALUES (?1, ?2)",
        rusqlite::params![nombre_trimmed, salario_personal_objetivo_centavos],
    )
    .map_err(|e| format!("inserting Usuario: {e}"))?;

    Ok(conn.last_insert_rowid())
}

/// Wrapper IPC: abre la conexión y delega en `cmd_crear_perfil_impl`.
#[tauri::command]
pub async fn cmd_crear_perfil(
    app: tauri::AppHandle,
    input: CrearPerfilInput,
) -> Result<i64, String> {
    let conn = db::abrir_conexion(&app)?;
    cmd_crear_perfil_impl(&conn, input.nombre, input.salario_personal_objetivo_centavos)
}

/// Devuelve UN perfil por id (lookup 1-a-1).
///
/// `query_row` devuelve `Err` si no encuentra fila — eso se propaga como
/// `String` con un mensaje identificable (útil para que la UI sepa que
/// el id ya no existe).
pub fn cmd_obtener_perfil_impl(conn: &Connection, id: i64) -> Result<UsuarioDto, String> {
    conn.query_row(
        "SELECT id, nombre, salario_personal_objetivo_centavos, modo_mejorado_activo \
         FROM Usuarios WHERE id = ?1",
        [id],
        |row| {
            Ok(UsuarioDto {
                id: row.get(0)?,
                nombre: row.get(1)?,
                salario_personal_objetivo_centavos: row.get(2)?,
                modo_mejorado_activo: row.get::<_, i64>(3)? != 0,
            })
        },
    )
    .map_err(|e| format!("looking up Usuario id={id}: {e}"))
}

/// Wrapper IPC: abre la conexión y delega en `cmd_obtener_perfil_impl`.
#[tauri::command]
pub async fn cmd_obtener_perfil(app: tauri::AppHandle, id: i64) -> Result<UsuarioDto, String> {
    let conn = db::abrir_conexion(&app)?;
    cmd_obtener_perfil_impl(&conn, id)
}

// ===========================================================================
// Slice 11: REQ-602 (Simulador UI — CRUD de propuestas) + REQ-603
// (soporte multi-perfil en la tabla `Simulador`).
// ===========================================================================
//
// Tres comandos nuevos:
//
//   * `cmd_listar_simulaciones`  — devuelve todas las propuestas del
//                                 `usuario_id` activo, JOINed con la
//                                 transacción padre (espejo del
//                                 repositorio `simulador::repo`).
//   * `cmd_upsert_simulacion`    — idempotente: INSERT … ON CONFLICT
//                                 DO UPDATE; valida que la transacción
//                                 exista y pertenezca al usuario
//                                 (defense in depth — la FK ya garantiza
//                                 la primera mitad, pero el `usuario_id`
//                                 del payload refuerza REQ-603).
//   * `cmd_eliminar_simulacion`  — borra la propuesta para la
//                                 `transaccion_id` (no afecta la
//                                 transacción padre).
//
// Y un nuevo DTO público `SimulacionCompletaDto` — espejo 1-a-1 de las
// columnas de la tabla `Simulador` (snake_case en JSON vía `serde` por
// defecto, sin transformaciones en la frontera IPC).
//
// ===========================================================================

/// DTO que la capa React consume para cada propuesta de Simulador.
///
/// Espejo 1-a-1 de la fila SQL `Simulador` (sin JOIN al TS porque la UI
/// ya resuelve nombre+concepto por su cuenta via el array de
/// transacciones y categorías). El naming snake_case se preserva en el
/// JSON que cruza el IPC para que el binding TS pueda consumirlo sin
/// transformaciones.
#[derive(serde::Serialize, Clone, Debug)]
pub struct SimulacionCompletaDto {
    pub id: i64,
    pub usuario_id: i64,
    pub transaccion_id: i64,
    pub nuevo_valor_centavos: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

/// Devuelve TODAS las propuestas de Simulador para `usuario_id`.
///
/// Proyecta cada fila de `simulador::repo::Simulacion` a
/// `SimulacionCompletaDto`. La consulta SQL del repo proyecta la fila
/// JOINed pero NO expone `usuario_id` (lo usa sólo internamente via
/// el `WHERE t.usuario_id = ?1`); acá lo añadimos con un JOIN
/// explícito para que el DTO lleve el `usuario_id` que la UI necesita
/// para correlacionar con `TransaccionCompletaDto` y (futuro) dibujar
/// el chip de perfil activo.
///
/// Mantenemos `simulador::repo::list_by_user` como "fuente de verdad"
/// para el resto de la lógica del repo; este comando es la única
/// superficie del repo que necesita `usuario_id` proyectado.
pub fn cmd_listar_simulaciones_impl(
    conn: &Connection,
    usuario_id: i64,
) -> Result<Vec<SimulacionCompletaDto>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT s.id, s.usuario_id, s.transaccion_id,
                    s.nuevo_valor_centavos, s.created_at, s.updated_at
             FROM Simulador s
             WHERE s.usuario_id = ?1
             ORDER BY s.transaccion_id ASC",
        )
        .map_err(|e| format!("preparing SELECT Simulador: {e}"))?;

    let rows = stmt
        .query_map([usuario_id], |row| {
            Ok(SimulacionCompletaDto {
                id: row.get(0)?,
                usuario_id: row.get(1)?,
                transaccion_id: row.get(2)?,
                nuevo_valor_centavos: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })
        .map_err(|e| format!("querying Simulador: {e}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("collecting Simulador rows: {e}"))?;

    Ok(rows)
}

/// Wrapper IPC: abre la conexión y delega en `cmd_listar_simulaciones_impl`.
#[tauri::command]
pub async fn cmd_listar_simulaciones(
    app: tauri::AppHandle,
    usuario_id: i64,
) -> Result<Vec<SimulacionCompletaDto>, String> {
    let conn = db::abrir_conexion(&app)?;
    cmd_listar_simulaciones_impl(&conn, usuario_id)
}

/// Inserta (o actualiza) la propuesta del Simulador para
/// `transaccion_id`.
///
/// Reglas (test plan §2 + REQ-602 + REQ-603):
///   * La transacción padre DEBE existir; si no, se rechaza con error
///     legible (la FK del SQL lo rechazaría, pero devolvemos un mensaje
///     más claro para la UI).
///   * La transacción padre DEBE pertenecer al `usuario_id` del payload
///     (defense in depth — la FK no cubre este chequeo cross-table).
///   * `nuevo_valor_centavos >= 0` se enforce con el CHECK del SQL;
///     reventamos con `rusqlite::Error` que se propaga como `Err(_)`.
///
/// Firma posicional `(conn, transaccion_id, nuevo_valor_centavos, usuario_id)`
/// pineada por el test RED (`commands_test.rs` §Slice 11 — el TS wrapper
/// también la pinea como `input: UpsertSimulacionInput`).
pub fn cmd_upsert_simulacion_impl(
    conn: &Connection,
    transaccion_id: i64,
    nuevo_valor_centavos: i64,
    usuario_id: i64,
) -> Result<i64, String> {
    // Defensa contra transacciones inexistentes y contra uso cruzado
    // de `usuario_id` (cross-profile pollution, REQ-603).
    let tx_user_id: i64 = conn
        .query_row(
            "SELECT usuario_id FROM Transacciones WHERE id = ?1",
            [transaccion_id],
            |row| row.get(0),
        )
        .map_err(|e| {
            format!(
                "upsert simulacion: transaccion {transaccion_id} no existe: {e}"
            )
        })?;

    if tx_user_id != usuario_id {
        return Err(format!(
            "upsert simulacion: transaccion {transaccion_id} pertenece al usuario {tx_user_id}, no al usuario {usuario_id}"
        ));
    }

    let simulacion_input = SimulacionInput {
        transaccion_id,
        nuevo_valor_centavos,
    };
    crate::simulador::repo::upsert(conn, &simulacion_input).map_err(|e| e.to_string())
}

/// Input del comando `cmd_upsert_simulacion`.
///
/// Modelo paralelo a `CrearPerfilInput`/`TransaccionInput`: el wrapper
/// IPC recibe un único struct que Tauri v2 mapea desde el payload
/// `{ input: ... }` del `invoke` del frontend. Las keys del payload
/// deben llamarse `transaccionId`, `nuevoValorCentavos`, `usuarioId`
/// (camelCase) — se pinean así en el test RED del slice 11. El
/// `rename_all = "camelCase"` de `serde` mapea camelCase del JSON a
/// los nombres snake_case de los campos Rust sin duplicación.
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertSimulacionInput {
    pub transaccion_id: i64,
    pub nuevo_valor_centavos: i64,
    pub usuario_id: i64,
}

/// Wrapper IPC: abre la conexión y delega en `cmd_upsert_simulacion_impl`.
#[tauri::command]
pub async fn cmd_upsert_simulacion(
    app: tauri::AppHandle,
    input: UpsertSimulacionInput,
) -> Result<i64, String> {
    let conn = db::abrir_conexion(&app)?;
    cmd_upsert_simulacion_impl(&conn, input.transaccion_id, input.nuevo_valor_centavos, input.usuario_id)
}

/// Elimina la propuesta del Simulador para la transacción dada.
///
/// No-op si no existe (la semántica de `repo::delete` usa `execute` que
/// devuelve 0 filas afectadas sin error — es coherente con el contrato
/// "idempotente" del CRUD del Simulador). La UI debe refrescar la lista
/// después de la llamada para reflejar el cambio.
pub fn cmd_eliminar_simulacion_impl(
    conn: &Connection,
    transaccion_id: i64,
) -> Result<(), String> {
    crate::simulador::repo::delete(conn, transaccion_id)
        .map_err(|e| format!("eliminando simulacion: {e}"))
}

/// Wrapper IPC: abre la conexión y delega en `cmd_eliminar_simulacion_impl`.
#[tauri::command]
pub async fn cmd_eliminar_simulacion(
    app: tauri::AppHandle,
    transaccion_id: i64,
) -> Result<(), String> {
    let conn = db::abrir_conexion(&app)?;
    cmd_eliminar_simulacion_impl(&conn, transaccion_id)
}
