//! Tests for REQ-402: Simulador repository (Rust backend).
//!
//! Spec:    `openspec/changes/mvp-financiero-local-first/spec.md` §REQ-402
//! Design:  `openspec/changes/mvp-financiero-local-first/design.md` §5.5
//!          (DDL `Simulador` table), §6.2 (IPC commands),
//!          §10 (Panel Simulador).
//! Tasks:   T-402 (debounce), T-403 (flush on close), T-404 (left join).
//! Test #:  slice 5 / backend / REQ-402 (5 tests).
//!
//! RED PHASE: this file references the crate symbol
//! `app_diagnostico_financiero_local_lib::simulador::repo`, which does
//! NOT exist in `lib.rs` yet. `cargo test --no-run` MUST fail to
//! compile because of the unresolved module. That is the expected RED
//! state. The IMPL phase will introduce the module under
//! `src-tauri/src/simulador/repo.rs` (or `src-tauri/src/simulador.rs`)
//! and add `pub mod simulador;` to `lib.rs`.
//!
//! Each test uses `Connection::open_in_memory()` for isolation and
//! applies the canonical schema from `migrations/001_inicial.sql` via
//! `crate::migrations::apply_all(&conn)` (the same symbol Slice 2
//! already pinned). A `Usuario` and one `Transaccion` are inserted per
//! test so the FK constraints of `Simulador.transaccion_id` are
//! satisfied.
//!
//! Pin of signatures for the IMPL phase (from the user's prompt — binding):
//!
//!   pub struct SimulacionInput { ... }
//!   pub struct Simulacion { ... }
//!
//!   pub fn upsert(conn: &Connection, s: &SimulacionInput) -> rusqlite::Result<i64>
//!   pub fn list_by_user(conn: &Connection, usuario_id: i64) -> rusqlite::Result<Vec<Simulacion>>
//!   pub fn delete(conn: &Connection, transaccion_id: i64) -> rusqlite::Result<()>
//!
//! Schema reference (`migrations/001_inicial.sql`):
//!
//!   CREATE TABLE Simulador (
//!       id INTEGER PRIMARY KEY AUTOINCREMENT,
//!       transaccion_id INTEGER NOT NULL UNIQUE,
//!       nuevo_valor_centavos INTEGER NOT NULL CHECK (nuevo_valor_centavos >= 0),
//!       created_at INTEGER NOT NULL,
//!       updated_at INTEGER NOT NULL
//!   )
//!
//! Note: the column is `nuevo_valor_centavos` (matching the migration
//! file, after the design's `nuevo_valor_mensual_centavos` was
//! abbreviated for the `001_inicial.sql` DDL). The semantic is the
//! same — the user's new monthly amount in centavos. The IMPL phase
//! will surface it via the same name on both Rust and TS sides.

use app_diagnostico_financiero_local_lib::migrations::apply_all;
use app_diagnostico_financiero_local_lib::simulador::repo::{
    delete, list_by_user, upsert, Simulacion, SimulacionInput,
};
use rusqlite::Connection;

/// Test fixture: returns a fresh in-memory DB with the canonical schema
/// applied, one `Usuario` row, and the id of that row.
///
/// Also inserts one minimal `Transaccion` (Gasto No necesario) so the
/// FK of `Simulador.transaccion_id` is satisfied for the test that
/// needs it. Returns the ids of both the user and the transaction.
fn fresh_db_with_user_and_transaccion() -> (Connection, i64, i64) {
    let conn = Connection::open_in_memory().expect("open in-memory db");
    apply_all(&conn).expect("apply_all should succeed on a fresh db");

    conn.execute(
        "INSERT INTO Usuarios (nombre) VALUES (?1)",
        rusqlite::params!["TestUser"],
    )
    .expect("insert usuario");
    let usuario_id = conn.last_insert_rowid();

    let categoria_id: i64 = conn
        .query_row(
            "SELECT id FROM Categorias WHERE tipo_flujo = 'Gasto' LIMIT 1",
            [],
            |r| r.get(0),
        )
        .expect("categoria gasto");

    conn.execute(
        "INSERT INTO Transacciones (
             usuario_id, tipo_flujo, categoria_id, concepto,
             frecuencia, comportamiento, naturaleza_necesidad, valor_centavos
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        rusqlite::params![
            usuario_id,
            "Gasto",
            categoria_id,
            "Restaurantes",
            "Mensual",
            "Variable",
            "No necesario",
            60_000_000_i64,
        ],
    )
    .expect("insert transaccion");
    let transaccion_id = conn.last_insert_rowid();

    (conn, usuario_id, transaccion_id)
}

/// Helper to look up the first `Categorias.id` of a given `tipo_flujo`.
fn categoria_id_for(conn: &Connection, tipo_flujo: &str) -> i64 {
    conn.query_row(
        "SELECT id FROM Categorias WHERE tipo_flujo = ?1 LIMIT 1",
        rusqlite::params![tipo_flujo],
        |r| r.get::<_, i64>(0),
    )
    .unwrap_or_else(|err| panic!("expected at least one Categoria for {tipo_flujo}: {err}"))
}

/// Inserts a second `Transaccion` belonging to `usuario_id`. Returns
/// the new id. Used to verify `list_by_user` returns multiple rows
/// across different transactions of the same user.
fn insert_transaccion(conn: &Connection, usuario_id: i64, concepto: &str) -> i64 {
    let categoria_id = categoria_id_for(conn, "Gasto");
    conn.execute(
        "INSERT INTO Transacciones (
             usuario_id, tipo_flujo, categoria_id, concepto,
             frecuencia, comportamiento, naturaleza_necesidad, valor_centavos
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        rusqlite::params![
            usuario_id,
            "Gasto",
            categoria_id,
            concepto,
            "Mensual",
            "Fijo",
            "No tan necesario",
            12_000_000_i64,
        ],
    )
    .expect("insert transaccion");
    conn.last_insert_rowid()
}

/// REQ-402 / Scenario: "Modificación de valor en simulador".
///
/// Given: a `Usuario` and one `Transaccion` already in the DB.
/// When:  `upsert(transaccion_id, nuevo_valor_centavos)` is called.
/// Then:  the row is created in `Simulador`, with `nuevo_valor_centavos`
///        equal to the input, and the returned id is a positive i64.
#[test]
fn req_402_repo_inserts_simulacion_for_transaccion() {
    let (conn, _usuario_id, transaccion_id) = fresh_db_with_user_and_transaccion();

    let id = upsert(
        &conn,
        &SimulacionInput {
            transaccion_id,
            nuevo_valor_centavos: 20_000_000, // $200,000
        },
    )
    .expect("upsert should succeed for valid input");

    assert!(
        id > 0,
        "REQ-402: upsert must return a positive row id (got {id})",
    );

    let stored: i64 = conn
        .query_row(
            "SELECT nuevo_valor_centavos FROM Simulador WHERE id = ?1",
            rusqlite::params![id],
            |r| r.get(0),
        )
        .expect("select inserted simulacion");
    assert_eq!(
        stored, 20_000_000,
        "REQ-402: nuevo_valor_centavos must round-trip exactly (no float drift)",
    );

    let fk_ok: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM Simulador WHERE transaccion_id = ?1",
            rusqlite::params![transaccion_id],
            |r| r.get(0),
        )
        .expect("count by transaccion_id");
    assert_eq!(
        fk_ok, 1,
        "REQ-402: the simulacion must be linked to the given transaccion_id",
    );
}

/// REQ-402 / Scenario: "Modificación de valor en simulador" — repeated.
///
/// Given: a `Simulador` row already exists for `transaccion_id`.
/// When:  `upsert(transaccion_id, nuevo_valor_centavos)` is called again
///        with a different value.
/// Then:  the same row is updated in place (no duplicate row) because
///        the schema declares `UNIQUE (transaccion_id)` on `Simulador`.
///        `calcularMatrizMejorada` will read the new value, not the old.
#[test]
fn req_402_repo_updates_simulacion_in_place() {
    let (conn, _usuario_id, transaccion_id) = fresh_db_with_user_and_transaccion();

    let first_id = upsert(
        &conn,
        &SimulacionInput {
            transaccion_id,
            nuevo_valor_centavos: 60_000_000, // $600,000 (same as base)
        },
    )
    .expect("first upsert");

    let second_id = upsert(
        &conn,
        &SimulacionInput {
            transaccion_id,
            nuevo_valor_centavos: 20_000_000, // $200,000 (improved)
        },
    )
    .expect("second upsert");

    // The schema's `UNIQUE (transaccion_id)` constraint MUST be honored
    // by the IMPL: the second upsert either updates in place (same id)
    // or inserts a new row but the UNIQUE constraint then forces a
    // constraint-violation path. The IMPL is expected to take the
    // "update in place" path (same id) — that's the `upsert` semantics.
    // We accept either equal ids OR an error, but NOT a duplicate row.
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM Simulador WHERE transaccion_id = ?1",
            rusqlite::params![transaccion_id],
            |r| r.get(0),
        )
        .expect("count");
    assert_eq!(
        count, 1,
        "REQ-402: upsert must NOT create a duplicate row (UNIQUE transaccion_id). Got {count} rows.",
    );

    // The stored value must be the LATEST upsert's value.
    let stored: i64 = conn
        .query_row(
            "SELECT nuevo_valor_centavos FROM Simulador WHERE id = ?1",
            rusqlite::params![if second_id > 0 { second_id } else { first_id }],
            |r| r.get(0),
        )
        .expect("select stored value");
    assert_eq!(
        stored, 20_000_000,
        "REQ-402: the stored value must equal the last upsert input",
    );
}

/// REQ-402 / Scenario: listing all simulations for a user, JOINed with
/// the base transaction data so the frontend can render `concepto` and
/// `categoria_nombre` without a second round-trip.
///
/// Given: two `Transacciones` of user X and one of user Y; one
///        `Simulador` row per transaction of user X.
/// When:  `list_by_user(X)` is called.
/// Then:  exactly the two X-owned rows come back, each carrying the
///        JOINed `concepto` and `categoria_nombre` from `Transacciones`
///        + `Categorias`. The Y-owned row is NOT visible (REQ-603
///        multi-profile isolation).
#[test]
fn req_402_repo_lists_simulaciones_for_user() {
    let (conn, x_id, transaccion_x1) = fresh_db_with_user_and_transaccion();

    // Second transaccion for user X.
    let transaccion_x2 = insert_transaccion(&conn, x_id, "Internet y telefono");

    // Third user with their own transaccion + simulacion — must NOT be
    // visible to `list_by_user(x_id)`.
    conn.execute(
        "INSERT INTO Usuarios (nombre) VALUES (?1)",
        rusqlite::params!["OtherUser"],
    )
    .expect("insert other user");
    let other_id = conn.last_insert_rowid();
    let transaccion_other = insert_transaccion(&conn, other_id, "Domicilios");

    // Insert three simulaciones (two for X, one for Other).
    upsert(
        &conn,
        &SimulacionInput {
            transaccion_id: transaccion_x1,
            nuevo_valor_centavos: 20_000_000,
        },
    )
    .expect("upsert for x1");
    upsert(
        &conn,
        &SimulacionInput {
            transaccion_id: transaccion_x2,
            nuevo_valor_centavos: 5_000_000,
        },
    )
    .expect("upsert for x2");
    upsert(
        &conn,
        &SimulacionInput {
            transaccion_id: transaccion_other,
            nuevo_valor_centavos: 10_000_000,
        },
    )
    .expect("upsert for other");

    let sims: Vec<Simulacion> = list_by_user(&conn, x_id).expect("list_by_user must succeed");

    assert_eq!(
        sims.len(),
        2,
        "REQ-402 + REQ-603: list_by_user must return only X-owned simulaciones (got {})",
        sims.len(),
    );

    // Every returned row must belong to user X (transaccion_id must be
    // one of X's ids).
    let x_transaccion_ids = [transaccion_x1, transaccion_x2];
    for s in &sims {
        assert!(
            x_transaccion_ids.contains(&s.transaccion_id),
            "REQ-603: simulacion.transaccion_id={} must belong to user X",
            s.transaccion_id,
        );
        assert!(
            s.concepto == "Restaurantes" || s.concepto == "Internet y telefono",
            "REQ-402: JOINed concepto must be the original Transaccion.concepto (got {})",
            s.concepto,
        );
        assert!(
            s.categoria_nombre == "Alimentacion"
                || s.categoria_nombre == "Otros gastos"
                || s.categoria_nombre == "Entretenimiento"
                || s.categoria_nombre == "Familia",
            "REQ-402: JOINed categoria_nombre must come from Categorias (got {})",
            s.categoria_nombre,
        );
        assert!(
            s.categoria_id > 0,
            "REQ-402: JOINed categoria_id must be hydrated from Transacciones",
        );
    }
}

/// REQ-402 / Scenario: validation against the schema CHECK constraint.
///
/// Given: the `Simulador.nuevo_valor_centavos` column has a CHECK
///        constraint `>= 0`.
/// When:  the repository is asked to upsert with `nuevo_valor_centavos = -1`.
/// Then:  the SQL engine rejects the operation and the repository
///        surfaces a `rusqlite::Error`. No row is persisted.
#[test]
fn req_402_repo_rejects_negative_nuevo_valor() {
    let (conn, _usuario_id, transaccion_id) = fresh_db_with_user_and_transaccion();

    let result = upsert(
        &conn,
        &SimulacionInput {
            transaccion_id,
            nuevo_valor_centavos: -1,
        },
    );
    assert!(
        result.is_err(),
        "REQ-402: upsert with nuevo_valor_centavos = -1 must fail the SQL CHECK constraint",
    );

    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM Simulador", [], |r| r.get(0))
        .expect("count");
    assert_eq!(
        count, 0,
        "REQ-402: a rejected upsert must not leave a row in Simulador",
    );
}

/// REQ-402 / Scenario: "Limpiar propuesta" / REQ-403 left-join fallback.
///
/// Given: a `Simulador` row exists for `transaccion_id`.
/// When:  `delete(transaccion_id)` is called.
/// Then:  the row is gone from `Simulador`. The next `calcularMatriz`
///        (without simulador) MUST use the base `Transaccion.valor_centavos`
///        — the IMPL will exercise this contract; here we verify the
///        storage-level invariant: the row is removed.
#[test]
fn req_402_repo_deletes_simulacion_on_user_request() {
    let (conn, _usuario_id, transaccion_id) = fresh_db_with_user_and_transaccion();

    upsert(
        &conn,
        &SimulacionInput {
            transaccion_id,
            nuevo_valor_centavos: 20_000_000,
        },
    )
    .expect("upsert");

    let before: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM Simulador WHERE transaccion_id = ?1",
            rusqlite::params![transaccion_id],
            |r| r.get(0),
        )
        .expect("count before");
    assert_eq!(before, 1, "precondition: one row exists");

    delete(&conn, transaccion_id).expect("delete must succeed");

    let after: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM Simulador WHERE transaccion_id = ?1",
            rusqlite::params![transaccion_id],
            |r| r.get(0),
        )
        .expect("count after");
    assert_eq!(
        after, 0,
        "REQ-402: delete must remove the simulacion row (fallback to base value)",
    );

    // The base Transaccion must remain — only the Simulador row goes away.
    let tx_still_there: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM Transacciones WHERE id = ?1",
            rusqlite::params![transaccion_id],
            |r| r.get(0),
        )
        .expect("count transaccion");
    assert_eq!(
        tx_still_there, 1,
        "REQ-402: delete on Simulador must NOT cascade-delete the Transaccion",
    );
}