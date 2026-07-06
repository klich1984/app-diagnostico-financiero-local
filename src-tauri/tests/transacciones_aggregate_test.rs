//! Tests for REQ-301: Backend contract lock-in for aggregation.
//!
//! Slice 4 of `mvp-financiero-local-first` performs **all aggregation in
//! the TypeScript frontend** (no Rust `SUMIFS` queries), per design.md §1
//! rule 1 ("cero columnas calculadas en SQL") + §9 (KPIs computed in TS).
//! That decision means the Rust backend's only job for slice 4 is to give
//! the frontend enough data — its own tests are a **contract pin** to make
//! sure `list_by_user` returns the shape the matrix layer expects.
//!
//! Spec:    `openspec/changes/mvp-financiero-local-first/spec.md` §REQ-301
//! Design:  `openspec/changes/mvp-financiero-local-first/design.md` §9
//!          (motor de cálculo KPIs) and §10 (matriz SUMIFS virtual).
//! Tasks:   T-301 (usePresupuestoStore), T-302 (matriz SUMIFS), T-303
//!          (Recharts visuals), T-304 (Presupuesto page). All depend on
//!          these contract pins.
//! Test #:  slice 4 / backend / REQ-301 (3 tests).
//!
//! RED PHASE NOTE: these tests **should compile and pass today** because
//! `app_diagnostico_financiero_local_lib::transacciones::repo` already
//! exists (slice 3 added it). That is intentional. The purpose of this
//! file is **contract lock-in**: if these tests ever regress, the frontend
//! aggregation layer cannot recover, so we pin the minimal shape here
//! before slice 4's TS work begins.
//!
//! Pin of contracts that slice 4 relies on:
//!
//!   * `Transaccion.categoria_id` is `i64` and joins against
//!     `Categorias.id` (PK of `Categorias`).
//!   * `Categorias.tipo_flujo` ∈ {`Ingreso`, `Gasto`} is the column that
//!     the TS aggregation layer aliases as `grupo_pertenencia`.
//!   * `Categorias.nombre` is the human-readable key used to group rows
//!     in the matriz (one bucket per category name).
//!   * `list_by_user` returns one row per `Transaccion` for the given
//!     `usuario_id`, with no leakage from other profiles (REQ-603).
//!
//! Each test follows the same pattern as `transacciones_repo_test.rs`:
//! `Connection::open_in_memory()` + `apply_all(&conn)` from slice 2, one
//! `Usuario` row, and enough `Transacciones` to exercise the contract.

use app_diagnostico_financiero_local_lib::migrations::apply_all;
use app_diagnostico_financiero_local_lib::transacciones::repo::{insert, list_by_user, TransaccionInput};
use rusqlite::Connection;

/// Test fixture: returns a fresh in-memory DB with the canonical schema
/// applied and one `Usuario` row whose id is returned. Mirrors the
/// pattern from `transacciones_repo_test.rs` so the slice 4 contract
/// stays aligned with the slice 3 CRUD tests.
fn fresh_db_with_user() -> (Connection, i64) {
    let conn = Connection::open_in_memory().expect("open in-memory db");
    apply_all(&conn).expect("apply_all should succeed on a fresh db");
    conn.execute(
        "INSERT INTO Usuarios (nombre) VALUES (?1)",
        rusqlite::params!["TestUser"],
    )
    .expect("insert usuario");
    let usuario_id = conn.last_insert_rowid();
    (conn, usuario_id)
}

/// Returns a `TransaccionInput` for an Ingreso row. Per the cross-column
/// CHECK in `001_inicial.sql`, `tipo_flujo = 'Ingreso'` requires
/// `comportamiento` and `naturaleza_necesidad` to be `NULL`.
fn ingreso_input(
    usuario_id: i64,
    categoria_id: i64,
    valor_centavos: i64,
    frecuencia: &str,
) -> TransaccionInput {
    TransaccionInput {
        usuario_id: Some(usuario_id),
        tipo_flujo: "Ingreso".to_string(),
        categoria_id,
        concepto: "Salario".to_string(),
        frecuencia: frecuencia.to_string(),
        comportamiento: None,        // Ingreso: comportamiento MUST be NULL
        naturaleza_necesidad: None,  // Ingreso: naturaleza_necesidad MUST be NULL
        valor_centavos,
    }
}

/// Returns a `TransaccionInput` for a Gasto row. The cross-column CHECK
/// requires both `comportamiento` and `naturaleza_necesidad` to be NOT
/// NULL for `tipo_flujo = 'Gasto'`.
fn gasto_input(
    usuario_id: i64,
    categoria_id: i64,
    valor_centavos: i64,
    frecuencia: &str,
    comportamiento: &str,
    naturaleza_necesidad: &str,
) -> TransaccionInput {
    TransaccionInput {
        usuario_id: Some(usuario_id),
        tipo_flujo: "Gasto".to_string(),
        categoria_id,
        concepto: "Internet".to_string(),
        frecuencia: frecuencia.to_string(),
        comportamiento: Some(comportamiento.to_string()),
        naturaleza_necesidad: Some(naturaleza_necesidad.to_string()),
        valor_centavos,
    }
}

/// Reads `(nombre, tipo_flujo)` for `categoria_id`. The aggregation layer
/// (slice 4, frontend) joins this data in TypeScript via the in-memory
/// `Categorias` lookup, so we pin the SQL shape here.
fn categoria_lookup(conn: &Connection, categoria_id: i64) -> (String, String) {
    conn.query_row(
        "SELECT nombre, tipo_flujo FROM Categorias WHERE id = ?1",
        rusqlite::params![categoria_id],
        |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)),
    )
    .expect("categoria row must exist in seed")
}

// ---------------------------------------------------------------------------
// REQ-301 contract pin: repo returns rows whose categoria_id joins
// against Categorias to give the frontend the per-row tipo_flujo (which
// the TS layer aliases as grupo_pertenencia) and categoria name.
// ---------------------------------------------------------------------------

/// REQ-301 / Scenario: "Agregación de ingresos por categoría".
///
/// Given: an in-memory DB with one Usuario and one Ingreso (categoria =
///        the first Ingreso row from the seed: "Salario").
/// When:  the repository `list_by_user(usuario_id)` is called and we
///        join its `categoria_id` against `Categorias` (FK target).
/// Then:  the join produces `tipo_flujo = "Ingreso"` and `nombre =
///        "Salario"`, matching what the TS `calcularMatriz` will use
///        to bucket the row under the Ingresos section.
#[test]
fn req_301_repo_returns_all_transacciones_with_categoria_join() {
    let (conn, usuario_id) = fresh_db_with_user();

    // Resolve an Ingreso categoria id from the canonical seed.
    let categoria_id: i64 = conn
        .query_row(
            "SELECT id FROM Categorias WHERE tipo_flujo = 'Ingreso' \
             AND nombre = 'Salario' LIMIT 1",
            [],
            |r| r.get::<_, i64>(0),
        )
        .expect("seed must contain 'Salario' categoria for Ingreso");

    insert(
        &conn,
        &ingreso_input(usuario_id, categoria_id, 400_000_000, "Mensual"),
    )
    .expect("insert Ingreso row");

    let rows = list_by_user(&conn, usuario_id).expect("list_by_user");
    assert_eq!(
        rows.len(),
        1,
        "REQ-301: list_by_user must return the one inserted Ingreso",
    );

    // Now do the same join the TS layer will run in memory: for each row,
    // look up the matching categoria and pull (nombre, tipo_flujo).
    let row = &rows[0];
    assert_eq!(
        row.categoria_id, categoria_id,
        "REQ-301: Transaccion.categoria_id must match the inserted id",
    );
    let (nombre, tipo_flujo) = categoria_lookup(&conn, row.categoria_id);
    assert_eq!(
        tipo_flujo, "Ingreso",
        "REQ-301: join must surface tipo_flujo='Ingreso' (TS alias \
         grupo_pertenencia='INGRESO') so the matriz puts the row in the \
         right column",
    );
    assert_eq!(
        nombre, "Salario",
        "REQ-301: join must surface the categoria nombre verbatim \
         (the matriz buckets rows by it)",
    );
}

// ---------------------------------------------------------------------------
// REQ-301 contract pin: list_by_user lets the TS layer partition the
// returned rows into Ingresos vs Gastos by filtering on tipo_flujo.
// ---------------------------------------------------------------------------

/// REQ-301 / Scenario: "Agregación de ingresos por categoría" (multi-flow).
///
/// Given: one Ingreso and one Gasto for the same Usuario (plus one row
///        for a different user to verify REQ-603 isolation).
/// When:  `list_by_user` is called and the returned rows are partitioned
///        by `tipo_flujo`.
/// Then:  the Ingreso row appears in the "Ingreso" bucket and the Gasto
///        row in the "Gasto" bucket, matching the matriz's two-column
///        layout (Ingresos por categoria on top, Gastos abajo).
#[test]
fn req_301_repo_returns_ingresos_separated_from_gastos() {
    let (conn, usuario_id) = fresh_db_with_user();

    // Second user (REQ-603 isolation test).
    conn.execute(
        "INSERT INTO Usuarios (nombre) VALUES (?1)",
        rusqlite::params!["OtherUser"],
    )
    .expect("insert second usuario");
    let other_id = conn.last_insert_rowid();

    let cat_ingreso: i64 = conn
        .query_row(
            "SELECT id FROM Categorias WHERE tipo_flujo = 'Ingreso' LIMIT 1",
            [],
            |r| r.get::<_, i64>(0),
        )
        .expect("seed must contain at least one Ingreso categoria");
    let cat_gasto: i64 = conn
        .query_row(
            "SELECT id FROM Categorias WHERE tipo_flujo = 'Gasto' LIMIT 1",
            [],
            |r| r.get::<_, i64>(0),
        )
        .expect("seed must contain at least one Gasto categoria");

    insert(
        &conn,
        &ingreso_input(usuario_id, cat_ingreso, 400_000_000, "Mensual"),
    )
    .expect("insert Ingreso for primary user");
    insert(
        &conn,
        &gasto_input(usuario_id, cat_gasto, 150_000_00, "Mensual", "Fijo", "Necesario"),
    )
    .expect("insert Gasto for primary user");
    insert(
        &conn,
        &ingreso_input(other_id, cat_ingreso, 999_999, "Mensual"),
    )
    .expect("insert Ingreso for OTHER user (must NOT leak)");

    let rows = list_by_user(&conn, usuario_id).expect("list_by_user");

    let ingresos: Vec<_> = rows
        .iter()
        .filter(|r| r.tipo_flujo == "Ingreso")
        .collect();
    let gastos: Vec<_> = rows.iter().filter(|r| r.tipo_flujo == "Gasto").collect();

    assert_eq!(
        ingresos.len(),
        1,
        "REQ-301: TS layer must be able to filter Ingresos by tipo_flujo",
    );
    assert_eq!(
        gastos.len(),
        1,
        "REQ-301: TS layer must be able to filter Gastos by tipo_flujo",
    );
    assert_eq!(
        ingresos[0].valor_centavos, 400_000_000,
        "REQ-301: the Ingreso row must be the one we inserted (no leak)",
    );
    assert_eq!(
        gastos[0].valor_centavos, 150_000_00,
        "REQ-301: the Gasto row must be the one we inserted",
    );
    assert!(
        rows.iter().all(|r| r.usuario_id == usuario_id),
        "REQ-603: no leakage from other profiles",
    );
}

// ---------------------------------------------------------------------------
// REQ-301 contract pin: Transaccion carries the categoria_id column so
// the TS layer can do the in-memory lookup.
// ---------------------------------------------------------------------------

/// REQ-301 / Scenario: "Agregación de gastos por naturaleza".
///
/// Given: a freshly inserted Gasto row.
/// When:  we read it back via `list_by_user`.
/// Then:  the struct field `categoria_id` is present and equal to the FK
///        we passed to `insert`. This is the field the TS aggregation
///        layer uses to key into the Categorias lookup.
#[test]
fn req_301_repo_includes_categoria_id_for_aggregation() {
    let (conn, usuario_id) = fresh_db_with_user();
    let cat_gasto: i64 = conn
        .query_row(
            "SELECT id FROM Categorias WHERE tipo_flujo = 'Gasto' LIMIT 1",
            [],
            |r| r.get::<_, i64>(0),
        )
        .expect("seed must contain at least one Gasto categoria");

    insert(
        &conn,
        &gasto_input(
            usuario_id,
            cat_gasto,
            50_000,
            "Mensual",
            "Fijo",
            "Necesario",
        ),
    )
    .expect("insert Gasto");

    let rows = list_by_user(&conn, usuario_id).expect("list_by_user");
    assert_eq!(
        rows.len(),
        1,
        "REQ-301: list_by_user must return the one inserted row",
    );
    assert_eq!(
        rows[0].categoria_id, cat_gasto,
        "REQ-301: Transaccion.categoria_id must round-trip through insert + \
         list_by_user without mutation — the TS layer joins on this field",
    );
}
