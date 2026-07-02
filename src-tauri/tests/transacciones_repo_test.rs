//! Tests for REQ-202: Transaction repository CRUD (Rust backend).
//!
//! Spec:    `openspec/changes/mvp-financiero-local-first/spec.md` §REQ-202
//! Design:  `openspec/changes/mvp-financiero-local-first/design.md` §5
//!          (DDL Transacciones table), §8 (normalization), §14 (TDD).
//! Tasks:   T-202, T-203, T-205 (Slice 3).
//! Test #:  slice 3 / backend / REQ-202 (7 tests)
//!
//! RED PHASE: this file references the crate symbols
//! `app_diagnostico_financiero_local_lib::transacciones::repo`, which do NOT
//! exist in `lib.rs` yet. `cargo test --no-run` MUST fail to compile because
//! of the unresolved module. That is the expected RED state. The IMPL phase
//! will introduce the module under `src-tauri/src/transacciones/repo.rs` (or
//! `src-tauri/src/transacciones.rs`) and add `pub mod transacciones;` to
//! `lib.rs`.
//!
//! Each test uses `Connection::open_in_memory()` for isolation and applies
//! the canonical schema from `migrations/001_inicial.sql` via
//! `crate::migrations::apply_all(&conn)` (the same symbol Slice 2 already
//! pinned). A single test `Usuario` row is inserted so the FK constraints
//! of `Transacciones.usuario_id` are satisfied.
//!
//! Pin of signatures for the IMPL phase (from the user's prompt — binding):
//!
//!   pub struct TransaccionInput { ... }      // owned input, no `id`/`created_at`
//!   pub struct Transaccion { ... }            // hydrated row with `id` + timestamps
//!
//!   pub fn insert(conn: &Connection, t: &TransaccionInput) -> rusqlite::Result<i64>
//!   pub fn list_by_user(conn: &Connection, usuario_id: i64) -> rusqlite::Result<Vec<Transaccion>>
//!   pub fn update(conn: &Connection, id: i64, t: &TransaccionInput) -> rusqlite::Result<Transaccion>
//!   pub fn delete(conn: &Connection, id: i64) -> rusqlite::Result<()>

use app_diagnostico_financiero_local_lib::migrations::apply_all;
use app_diagnostico_financiero_local_lib::transacciones::repo::{
    delete, insert, list_by_user, update, Transaccion, TransaccionInput,
};
use rusqlite::Connection;

/// Test fixture: returns a fresh in-memory DB with the canonical schema
/// applied, one `Usuario` row, and the id of that row.
///
/// Why one fixture per test (instead of a shared `OnceCell`): each test
/// must be independent — in-memory SQLite is connection-scoped and the
/// constraint suite (esp. CHECK constraints) is best exercised on a
/// pristine DB to avoid bleed-through from prior inserts.
fn fresh_db_with_user() -> (Connection, i64) {
    let conn = Connection::open_in_memory().expect("open in-memory db");
    apply_all(&conn).expect("apply_all should succeed on a fresh db");

    // `conn.execute(...)` returns `Result<usize>` (rows affected). We just
    // need the side effect of having inserted the row, so we discard the
    // count and then ask SQLite for the new ROWID via last_insert_rowid().
    conn.execute(
        "INSERT INTO Usuarios (nombre) VALUES (?1)",
        rusqlite::params!["TestUser"],
    )
    .expect("insert usuario");

    // SQLite returns the ROWID for the last insert via last_insert_rowid().
    let usuario_id = conn.last_insert_rowid();
    (conn, usuario_id)
}

/// Returns the first `Categorias.id` of the given `tipo_flujo`. Used to
/// satisfy the FK constraint on `Transacciones.categoria_id` without hard
/// coding category ids (which would make the tests brittle to seed changes).
fn categoria_id_for(conn: &Connection, tipo_flujo: &str) -> i64 {
    conn.query_row(
        "SELECT id FROM Categorias WHERE tipo_flujo = ?1 LIMIT 1",
        rusqlite::params![tipo_flujo],
        |r| r.get::<_, i64>(0),
    )
    .unwrap_or_else(|err| panic!("expected at least one Categoria for {tipo_flujo}: {err}"))
}

/// Helper that builds a `TransaccionInput` for a "Gasto" row with the
/// minimum surface area required by the schema (comportamiento +
/// naturaleza_necesidad NOT NULL for Gasto per the cross-column CHECK).
fn gasto_input(usuario_id: i64, categoria_id: i64, valor_centavos: i64) -> TransaccionInput {
    TransaccionInput {
        usuario_id,
        tipo_flujo: "Gasto".to_string(),
        categoria_id,
        concepto: "Internet".to_string(),
        frecuencia: "Mensual".to_string(),
        comportamiento: Some("Fijo".to_string()),
        naturaleza_necesidad: Some("Necesario".to_string()),
        valor_centavos,
    }
}

/// REQ-202 / Scenario: "Inserción de nueva transacción".
///
/// Given: an in-memory DB with the schema applied and one Usuario + one
///        Categoria de tipo Gasto.
/// When:  the repository `insert` is called with `valor_centavos = 400000000`
///        (i.e. $4,000,000.00).
/// Then:  the new row exists in `Transacciones` with the exact same
///        `valor_centavos` (no lossy conversion — the value goes in as
///        INTEGER cents and stays INTEGER cents).
#[test]
fn req_202_repo_inserts_transaccion_with_centavos() {
    let (conn, usuario_id) = fresh_db_with_user();
    let categoria_id = categoria_id_for(&conn, "Gasto");

    let id = insert(
        &conn,
        &gasto_input(usuario_id, categoria_id, 400_000_000),
    )
    .expect("insert should succeed for valid Gasto row");

    let stored: i64 = conn
        .query_row(
            "SELECT valor_centavos FROM Transacciones WHERE id = ?1",
            rusqlite::params![id],
            |r| r.get(0),
        )
        .expect("select inserted row");
    assert_eq!(
        stored, 400_000_000,
        "REQ-202: valor_centavos must round-trip exactly (no float drift)"
    );
}

/// REQ-202 / Scenario: "Inserción de nueva transacción" + REQ-602 cross
/// column constraint.
///
/// Given: the schema enforces `valor_centavos > 0` (CHECK constraint) AND
///        the cross-column CHECK that ties tipo_flujo to
///        comportamiento / naturaleza_necesidad.
/// When:  a caller tries to insert with `valor_centavos = 0` or `-1`.
/// Then:  the repository surfaces an error and no row is persisted.
#[test]
fn req_202_repo_rejects_negative_or_zero_valor() {
    let (conn, usuario_id) = fresh_db_with_user();
    let categoria_id = categoria_id_for(&conn, "Gasto");

    for bad in [0_i64, -1_i64] {
        let result = insert(&conn, &gasto_input(usuario_id, categoria_id, bad));
        assert!(
            result.is_err(),
            "REQ-202: insert with valor_centavos = {bad} must fail the SQL CHECK constraint",
        );
    }

    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM Transacciones", [], |r| r.get(0))
        .expect("count");
    assert_eq!(
        count, 0,
        "REQ-202: failed inserts must not leave phantom rows in the table",
    );
}

/// REQ-202 / Scenario: "Inserción de nueva transacción" (multi-row listing).
///
/// Given: two rows belonging to `usuario_id = X` and one row belonging to a
///        different `usuario_id = Y`.
/// When:  `list_by_user(X)` is called.
/// Then:  only the two X-owned rows are returned, ordered by `created_at DESC`
///        (most recent first).
#[test]
fn req_202_repo_lists_all_transacciones_for_user() {
    let (conn, x_id) = fresh_db_with_user();
    let other_id: i64 = conn
        .execute(
            "INSERT INTO Usuarios (nombre) VALUES (?1)",
            rusqlite::params!["OtherUser"],
        )
        .map(|_rows| conn.last_insert_rowid())
        .expect("insert second usuario");
    let categoria_id = categoria_id_for(&conn, "Gasto");

    insert(
        &conn,
        &gasto_input(x_id, categoria_id, 100_000),
    )
    .expect("insert first row for X");

    // Sleep one second so the strftime('%s','now') timestamp bumps. The
    // timestamp resolution in SQLite is 1 second; if both rows shared the
    // same `created_at` the ordering assertion would be flaky.
    std::thread::sleep(std::time::Duration::from_secs(1));

    insert(
        &conn,
        &gasto_input(x_id, categoria_id, 200_000),
    )
    .expect("insert second row for X");

    insert(
        &conn,
        &gasto_input(other_id, categoria_id, 999_999),
    )
    .expect("insert row for OTHER user");

    let rows = list_by_user(&conn, x_id).expect("list_by_user must succeed");

    assert_eq!(
        rows.len(),
        2,
        "REQ-202: list_by_user must filter strictly by usuario_id \
         (no leak from other profiles — REQ-603)",
    );
    assert_eq!(
        rows[0].valor_centavos, 200_000,
        "REQ-202: ordering must be created_at DESC (newest first)",
    );
    assert_eq!(
        rows[1].valor_centavos, 100_000,
        "REQ-202: ordering must be created_at DESC (oldest last)",
    );
    for row in &rows {
        assert_eq!(
            row.usuario_id, x_id,
            "REQ-202: every returned row must belong to the requested user",
        );
    }
}

/// REQ-202 / Scenario: "Actualización de transacción existente".
///
/// Given: a row inserted with `valor_centavos = 400000000`.
/// When:  `update(id, new_input)` is called with `valor_centavos = 450000000`.
/// Then:  the returned `Transaccion` reflects the new value AND the row in
///        the DB matches.
#[test]
fn req_202_repo_updates_transaccion_in_place() {
    let (conn, usuario_id) = fresh_db_with_user();
    let categoria_id = categoria_id_for(&conn, "Gasto");

    let id = insert(
        &conn,
        &gasto_input(usuario_id, categoria_id, 400_000_000),
    )
    .expect("insert initial row");

    let mut new_input = gasto_input(usuario_id, categoria_id, 450_000_000);
    new_input.concepto = "Internet (actualizado)".to_string();

    let updated = update(&conn, id, &new_input).expect("update must succeed");

    assert_eq!(updated.id, id, "REQ-202: update must preserve the row id");
    assert_eq!(
        updated.valor_centavos, 450_000_000,
        "REQ-202: update must reflect the new valor_centavos",
    );
    assert_eq!(
        updated.concepto, "Internet (actualizado)",
        "REQ-202: update must reflect all changed fields",
    );

    let stored: (i64, i64) = conn
        .query_row(
            "SELECT valor_centavos, CAST(updated_at AS INTEGER) FROM Transacciones WHERE id = ?1",
            rusqlite::params![id],
            |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?)),
        )
        .expect("select updated row");
    assert_eq!(
        stored.0, 450_000_000,
        "REQ-202: the persisted row must equal the returned Transaccion",
    );
}

/// REQ-202 / Scenario: "Eliminación de transacción".
///
/// Given: a row inserted.
/// When:  `delete(id)` is called.
/// Then:  the row is no longer in the table and a subsequent
///        `list_by_user` does not include it.
#[test]
fn req_202_repo_soft_or_hard_deletes_transaccion() {
    let (conn, usuario_id) = fresh_db_with_user();
    let categoria_id = categoria_id_for(&conn, "Gasto");

    let id = insert(
        &conn,
        &gasto_input(usuario_id, categoria_id, 50_000),
    )
    .expect("insert");

    delete(&conn, id).expect("delete must succeed");

    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM Transacciones WHERE id = ?1",
            rusqlite::params![id],
            |r| r.get(0),
        )
        .expect("count");
    assert_eq!(
        count, 0,
        "REQ-202: delete must remove the row (hard delete — design §5.5)",
    );

    let rows = list_by_user(&conn, usuario_id).expect("list after delete");
    assert!(
        rows.iter().all(|r| r.id != id),
        "REQ-202: deleted id must not reappear in list_by_user",
    );
}

/// REQ-602 / Scenario: "Validación de frecuencia".
///
/// Given: the `Transacciones.frecuencia` column has a CHECK constraint
///        restricting it to {Mensual, Bimensual, Trimestral, Semestral, Anual}.
/// When:  the repository inserts a row with `frecuencia = "Bimestral123"`.
/// Then:  the SQL engine rejects the insert and the repository surfaces an
///        error. No row is persisted.
#[test]
fn req_202_repo_enforces_check_constraint_on_frecuencia() {
    let (conn, usuario_id) = fresh_db_with_user();
    let categoria_id = categoria_id_for(&conn, "Gasto");

    let mut bad = gasto_input(usuario_id, categoria_id, 100_000);
    bad.frecuencia = "Bimestral123".to_string();

    let result = insert(&conn, &bad);
    assert!(
        result.is_err(),
        "REQ-602: insert with frecuencia = 'Bimestral123' must fail the SQL CHECK constraint",
    );

    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM Transacciones", [], |r| r.get(0))
        .expect("count");
    assert_eq!(
        count, 0,
        "REQ-602: a rejected insert must not leave a row behind",
    );
}

/// REQ-602 / Cross-column constraint: `tipo_flujo = 'Ingreso'` requires
/// `comportamiento IS NULL AND naturaleza_necesidad IS NULL`.
///
/// Given: the cross-column CHECK in `001_inicial.sql`.
/// When:  a caller tries to insert `tipo_flujo='Ingreso'` with
///        `naturaleza_necesidad='Necesario'`.
/// Then:  the SQL engine rejects the insert and the repository surfaces an
///        error.
#[test]
fn req_202_repo_rejects_ingreso_with_naturaleza_necesidad() {
    let (conn, usuario_id) = fresh_db_with_user();
    let categoria_id = categoria_id_for(&conn, "Ingreso");

    let bad = TransaccionInput {
        usuario_id,
        tipo_flujo: "Ingreso".to_string(),
        categoria_id,
        concepto: "Salario mal categorizado".to_string(),
        frecuencia: "Mensual".to_string(),
        comportamiento: Some("Fijo".to_string()),     // <- violates Ingreso shape
        naturaleza_necesidad: Some("Necesario".to_string()),
        valor_centavos: 100_000,
    };

    let result = insert(&conn, &bad);
    assert!(
        result.is_err(),
        "REQ-602: Ingreso with naturaleza_necesidad must violate the \
         cross-column CHECK (comportamiento + naturaleza are Gasto-only)",
    );

    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM Transacciones", [], |r| r.get(0))
        .expect("count");
    assert_eq!(
        count, 0,
        "REQ-602: a rejected cross-column insert must not persist",
    );
}