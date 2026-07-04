//! Repositorio de la tabla `Simulador` (REQ-402 + REQ-403).
//!
//! Ver `openspec/changes/mvp-financiero-local-first/spec.md` §REQ-402,
//! §REQ-403 y `design.md` §5.5 (DDL), §6.2 (IPC), §10 (Panel Simulador).
//!
//! Cada función toma un `&Connection` de `rusqlite` para que los tests
//! de integración corran contra DBs en memoria sin instanciar el
//! runtime de Tauri.
//!
//! Reglas duras:
//!   * `nuevo_valor_centavos >= 0` se enforce con el CHECK de SQL.
//!   * `UNIQUE (transaccion_id)` se respeta vía `ON CONFLICT DO UPDATE`
//!     en `upsert` — no quedan dos filas para el mismo
//!     `Transaccion.id`.
//!   * `Simulador.usuario_id` se copia desde `Transacciones.usuario_id`
//!     para mantener la coherencia de la FK (el caller no lo provee:
//!     se resuelve aquí mismo en una subconsulta).
//!   * El listado (`list_by_user`) hace JOIN con `Transacciones` y
//!     `Categorias` para que la UI reciba `concepto`, `categoria_id` y
//!     `categoria_nombre` en una sola lectura (REQ-402 +
//!     §10 "left join materialization" del design).

use rusqlite::{params, Connection, Row};

/// Input "crudo" para crear o actualizar una propuesta del Simulador.
/// NO incluye `id`, `usuario_id`, `created_at` ni `updated_at`: la DB
/// los asigna (el `usuario_id` se copia de la transacción padre).
pub struct SimulacionInput {
    pub transaccion_id: i64,
    pub nuevo_valor_centavos: i64,
}

/// Una fila hidratada de `Simulador` JOINed con la transacción y la
/// categoria padre. Es lo que la UI consume directamente para listar
/// las propuestas en el Panel Simulador.
pub struct Simulacion {
    pub id: i64,
    pub transaccion_id: i64,
    pub nuevo_valor_centavos: i64,
    pub created_at: i64,
    pub updated_at: i64,
    pub concepto: String,
    pub categoria_id: i64,
    pub categoria_nombre: String,
}

/// Hidrata una `Simulacion` desde un `Row` de `rusqlite`.
///
/// Orden de columnas esperado (alineado con el `SELECT` de
/// `list_by_user`):
///   0:id, 1:transaccion_id, 2:nuevo_valor_centavos,
///   3:created_at, 4:updated_at,
///   5:concepto, 6:categoria_id, 7:categoria_nombre.
fn row_to_simulacion(row: &Row<'_>) -> rusqlite::Result<Simulacion> {
    Ok(Simulacion {
        id: row.get(0)?,
        transaccion_id: row.get(1)?,
        nuevo_valor_centavos: row.get(2)?,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
        concepto: row.get(5)?,
        categoria_id: row.get(6)?,
        categoria_nombre: row.get(7)?,
    })
}

/// Inserta (o actualiza si ya existe) la propuesta del Simulador para
/// `s.transaccion_id`.
///
/// Semántica: `INSERT ... ON CONFLICT(transaccion_id) DO UPDATE` —
/// si ya hay una fila para esa transacción, se reemplaza
/// `nuevo_valor_centavos` y se refresca `updated_at`. La fila sigue
/// apuntando al mismo `id` (no se duplica, no se cambia el
/// `transaccion_id`).
///
/// `usuario_id` se resuelve desde `Transacciones.usuario_id` para
/// satisfacer el `NOT NULL` + FK de la tabla sin pedirle al caller que
/// lo provea. Si la transacción no existe, el INSERT falla con la FK
/// constraint y el caller recibe el `rusqlite::Error`.
///
/// # Errores
/// * `nuevo_valor_centavos < 0` ⇒ falla el CHECK de SQL.
/// * `transaccion_id` inexistente ⇒ falla el FK de SQL.
/// * Cualquier otro `rusqlite::Error` se propaga sin envolver.
pub fn upsert(conn: &Connection, s: &SimulacionInput) -> rusqlite::Result<i64> {
    let mut stmt = conn.prepare(
        "INSERT INTO Simulador (usuario_id, transaccion_id, nuevo_valor_centavos)
         SELECT t.usuario_id, t.id, ?1
         FROM Transacciones t
         WHERE t.id = ?2
         ON CONFLICT(transaccion_id) DO UPDATE SET
             nuevo_valor_centavos = excluded.nuevo_valor_centavos,
             updated_at = strftime('%s', 'now')
         RETURNING id",
    )?;

    let id: rusqlite::Result<i64> = stmt.query_row(
        params![s.nuevo_valor_centavos, s.transaccion_id],
        |row| row.get(0),
    );
    id
}

/// Devuelve todas las simulaciones de `usuario_id`, JOINed con la
/// transacción padre y la categoria para evitar un segundo round-trip
/// desde la UI.
///
/// Filtro: `Transacciones.usuario_id = ?1`. La JOIN es INNER — si la
/// transacción padre fue borrada, el `ON DELETE CASCADE` del FK ya
/// eliminó la fila de Simulador, así que no hay huérfanos visibles.
pub fn list_by_user(conn: &Connection, usuario_id: i64) -> rusqlite::Result<Vec<Simulacion>> {
    let mut stmt = conn.prepare(
        "SELECT s.id, s.transaccion_id, s.nuevo_valor_centavos,
                s.created_at, s.updated_at,
                t.concepto, t.categoria_id, c.nombre AS categoria_nombre
         FROM Simulador s
         JOIN Transacciones t ON t.id = s.transaccion_id
         JOIN Categorias    c ON c.id = t.categoria_id
         WHERE t.usuario_id = ?1
         ORDER BY s.transaccion_id ASC",
    )?;

    let rows = stmt
        .query_map(params![usuario_id], row_to_simulacion)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

/// Borra la propuesta del Simulador para la transacción dada. No
/// afecta la `Transaccion` padre (la FK tiene `ON DELETE CASCADE`
/// solo en la dirección Transaccion → Simulador, no al revés).
///
/// Borrar la simulación hace que `calcularMatrizMejorada` caiga al
/// fallback "sin propuesta" y use el `valor_centavos` base de la
/// transacción — exactamente lo que pide REQ-403.
pub fn delete(conn: &Connection, transaccion_id: i64) -> rusqlite::Result<()> {
    conn.execute(
        "DELETE FROM Simulador WHERE transaccion_id = ?1",
        params![transaccion_id],
    )?;
    Ok(())
}