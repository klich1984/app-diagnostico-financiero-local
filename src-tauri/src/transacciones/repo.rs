//! CRUD para la tabla `Transacciones` (REQ-202).
//!
//! Ver `openspec/changes/mvp-financiero-local-first/spec.md` §REQ-202 y
//! `design.md` §5.5 (DDL) + §14 (TDD por escenarios). Cada función
//! recibe un `&Connection` de `rusqlite` para que las pruebas de
//! integración puedan correr contra DBs en memoria sin instanciar el
//! runtime de Tauri.
//!
//! Reglas duras (de la tabla `Transacciones` y del contrato de Slice 3):
//!   * `valor_centavos > 0` se enforce con el CHECK de la columna.
//!   * `tipo_flujo IN ('Ingreso', 'Gasto')` se enforce con el CHECK.
//!   * `frecuencia IN ('Mensual', 'Bimensual', 'Trimestral', 'Semestral',
//!     'Anual')` se enforce con el CHECK.
//!   * El cross-column CHECK exige que `tipo_flujo = 'Ingreso'` ⇒
//!     `comportamiento IS NULL AND naturaleza_necesidad IS NULL`.
//!
//! Esos CHECKs viven en `migrations/001_inicial.sql` y se aplican vía
//! `crate::migrations::apply_all`. Este módulo NO los reproduce: se
//! apoya en el SQL para que la lógica de validación quede en un solo
//! lugar.

use rusqlite::{params, Connection, Row};

/// Input "crudo" para crear o actualizar una transacción.
/// NO incluye `id`, `created_at` ni `updated_at`: la DB los asigna.
pub struct TransaccionInput {
    pub usuario_id: i64,
    pub tipo_flujo: String,
    pub categoria_id: i64,
    pub concepto: String,
    pub frecuencia: String,
    pub comportamiento: Option<String>,
    pub naturaleza_necesidad: Option<String>,
    pub valor_centavos: i64,
}

/// Una fila hidratada de `Transacciones` (con `id` + timestamps + JOINed
/// `categoria_nombre` para que las capas de cálculo downstream no
/// necesiten un segundo round-trip).
///
/// `categoria_nombre` se incluye a partir del Slice 6 (Épica 4,
/// REQ-501) para soportar la detección de Deuda por nombre en el
/// motor de KPIs sin pedirle al caller que pase la lista de
/// categorias. El campo se hidrata vía JOIN con `Categorias` en
/// `list_by_user`. Las tests existentes no inspeccionan este campo,
/// así que la adición es backward-compatible.
///
/// `Clone` se necesita para que el motor de KPIs (Slice 6) pueda
/// materializar la vista "mejorada" sin mutar las transacciones
/// originales. `Debug` ayuda al diagnóstico de tests fallidos.
#[derive(Clone, Debug)]
pub struct Transaccion {
    pub id: i64,
    pub usuario_id: i64,
    pub tipo_flujo: String,
    pub categoria_id: i64,
    pub categoria_nombre: String,
    pub concepto: String,
    pub frecuencia: String,
    pub comportamiento: Option<String>,
    pub naturaleza_necesidad: Option<String>,
    pub valor_centavos: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

/// Hidrata una `Transaccion` desde un `Row` de `rusqlite`.
///
/// Orden de columnas esperado (alineado con el `SELECT` de
/// `list_by_user`):
///   0:id, 1:usuario_id, 2:tipo_flujo, 3:categoria_id,
///   4:categoria_nombre, 5:concepto, 6:frecuencia,
///   7:comportamiento, 8:naturaleza_necesidad, 9:valor_centavos,
///   10:created_at, 11:updated_at.
///
/// Se factoriza aquí (en vez de duplicar la lectura dentro de
/// `list_by_user` y `update`) para que cualquier futura columna nueva
/// se agregue en un único lugar.
fn row_to_transaccion(row: &Row<'_>) -> rusqlite::Result<Transaccion> {
    Ok(Transaccion {
        id: row.get(0)?,
        usuario_id: row.get(1)?,
        tipo_flujo: row.get(2)?,
        categoria_id: row.get(3)?,
        categoria_nombre: row.get(4)?,
        concepto: row.get(5)?,
        frecuencia: row.get(6)?,
        comportamiento: row.get(7)?,
        naturaleza_necesidad: row.get(8)?,
        valor_centavos: row.get(9)?,
        created_at: row.get(10)?,
        updated_at: row.get(11)?,
    })
}

/// Inserta una nueva transacción y devuelve el `id` asignado.
///
/// # Errores
/// Cualquier violación de los CHECKs (`valor_centavos > 0`,
/// `frecuencia` no válida, cross-column `tipo_flujo` vs
/// `comportamiento`/`naturaleza_necesidad`, FK de `usuario_id` o
/// `categoria_id`, etc.) se propaga como `rusqlite::Error` sin
/// envolver, para que el caller decida cómo traducirlo.
pub fn insert(conn: &Connection, t: &TransaccionInput) -> rusqlite::Result<i64> {
    conn.execute(
        "INSERT INTO Transacciones (
             usuario_id, tipo_flujo, categoria_id, concepto,
             frecuencia, comportamiento, naturaleza_necesidad,
             valor_centavos
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            t.usuario_id,
            t.tipo_flujo,
            t.categoria_id,
            t.concepto,
            t.frecuencia,
            t.comportamiento,
            t.naturaleza_necesidad,
            t.valor_centavos,
        ],
    )?;
    Ok(conn.last_insert_rowid())
}

/// Devuelve todas las transacciones de `usuario_id`, ordenadas por
/// `created_at DESC` (la más reciente primero). El test
/// `req_202_repo_lists_all_transacciones_for_user` pinea ese orden.
///
/// Hace INNER JOIN con `Categorias` para hidratar
/// `Transaccion.categoria_nombre` (Slice 6, REQ-501) — el motor de
/// KPIs necesita el nombre para detectar Deuda sin un segundo
/// round-trip. El FK de `categoria_id` es `ON DELETE RESTRICT`, así
/// que el JOIN nunca produce filas huérfanas.
pub fn list_by_user(conn: &Connection, usuario_id: i64) -> rusqlite::Result<Vec<Transaccion>> {
    let mut stmt = conn.prepare(
        "SELECT t.id, t.usuario_id, t.tipo_flujo, t.categoria_id,
                c.nombre AS categoria_nombre, t.concepto, t.frecuencia,
                t.comportamiento, t.naturaleza_necesidad, t.valor_centavos,
                t.created_at, t.updated_at
         FROM Transacciones t
         JOIN Categorias    c ON c.id = t.categoria_id
         WHERE t.usuario_id = ?1
         ORDER BY t.created_at DESC, t.id DESC",
    )?;

    let rows = stmt
        .query_map(params![usuario_id], row_to_transaccion)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

/// Actualiza una transacción existente.
///
/// Devuelve la fila ya actualizada. Si el `id` no existe, la operación
/// afecta 0 filas pero NO devuelve error: el caller decide si eso es
/// fallo (p. ej. comparando `updated.id`). Conservamos la semántica
/// de `rusqlite::Connection::execute` (cero filas es un éxito válido).
///
/// El trigger `trg_transacciones_updated_at` (definido en
/// `001_inicial.sql`) refresca `updated_at` automáticamente, así que
/// no lo tocamos manualmente.
pub fn update(conn: &Connection, id: i64, t: &TransaccionInput) -> rusqlite::Result<Transaccion> {
    conn.execute(
        "UPDATE Transacciones SET
             tipo_flujo          = ?1,
             categoria_id        = ?2,
             concepto            = ?3,
             frecuencia          = ?4,
             comportamiento      = ?5,
             naturaleza_necesidad = ?6,
             valor_centavos      = ?7
         WHERE id = ?8",
        params![
            t.tipo_flujo,
            t.categoria_id,
            t.concepto,
            t.frecuencia,
            t.comportamiento,
            t.naturaleza_necesidad,
            t.valor_centavos,
            id,
        ],
    )?;

    // Releer la fila para devolver la versión ya hidratada (incluye el
    // `updated_at` actualizado por el trigger + el JOINed
    // `categoria_nombre`).
    let mut stmt = conn.prepare(
        "SELECT t.id, t.usuario_id, t.tipo_flujo, t.categoria_id,
                c.nombre AS categoria_nombre, t.concepto, t.frecuencia,
                t.comportamiento, t.naturaleza_necesidad, t.valor_centavos,
                t.created_at, t.updated_at
         FROM Transacciones t
         JOIN Categorias    c ON c.id = t.categoria_id
         WHERE t.id = ?1",
    )?;
    stmt.query_row(params![id], row_to_transaccion)
}

/// Borrado duro (hard delete) de la fila con `id` dado.
///
/// La tabla `Transacciones` está referenciada por `Simulador` con
/// `ON DELETE CASCADE`, así que cualquier propuesta de simulador
/// asociada se limpia automáticamente.
pub fn delete(conn: &Connection, id: i64) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM Transacciones WHERE id = ?1", params![id])?;
    Ok(())
}