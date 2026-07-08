//! Tests for Slice 7 (post-MVP persistencia IPC): Tauri commands that
//! bridge the Rust backend to the React frontend.
//!
//! Spec:    `openspec/changes/mvp-financiero-local-first/spec.md` §REQ-202
//!          (Scenario: "Inserción de nueva transacción" +
//!          "Listado de transacciones por usuario" + "Catálogo de categorías").
//! Design:  `openspec/changes/mvp-financiero-local-first/design.md` §6.1
//!          (commands/ tree) + §6.2 (IPC contract table).
//! Tasks:   T-202 (Slice 3 backend CRUD), T-106 (Slice 2 first IPC commands).
//! Test #:  slice 7 / backend / REQ-202 IPC (5 tests).
//!
//! RED PHASE: this file references the crate symbol
//! `app_diagnostico_financiero_local_lib::commands`, which does NOT exist
//! in `lib.rs` yet (and the inner `pub fn *_impl(&Connection)` helpers
//! it expects also do NOT exist). `cargo test --no-run` MUST fail to
//! compile because of the unresolved module + symbols. That is the
//! expected RED state. The IMPL phase will introduce
//! `src-tauri/src/commands.rs` (or `src-tauri/src/commands/mod.rs`) and
//! add `pub mod commands;` to `lib.rs`, with the signature pattern
//! `pub fn cmd_obtener_categorias_impl(conn: &Connection) -> Result<Vec<CategoriaDto>, String>`.
//!
//! ## Why the test surface calls `*_impl(...)` directly (not `#[tauri::command]`)
//!
//! `#[tauri::command]`-decorated functions are NOT directly callable as
//! plain Rust functions — Tauri registers them via
//! `tauri::generate_handler!` and expects a runtime context (AppHandle,
//! State, etc.). The IMPL pattern (binding) is therefore:
//!
//! ```ignore
//! // src-tauri/src/commands.rs
//! pub fn cmd_obtener_categorias_impl(conn: &Connection) -> Result<Vec<CategoriaDto>, String> {
//!     // pure SQL — no Tauri runtime needed
//! }
//!
//! #[tauri::command]
//! pub async fn cmd_obtener_categorias(state: tauri::State<'_, DbState>)
//!     -> Result<Vec<CategoriaDto>, String>
//! {
//!     let conn = state.conn.lock().map_err(|e| e.to_string())?;
//!     cmd_obtener_categorias_impl(&conn)
//! }
//! ```
//!
//! Each test below calls the `*_impl` variant directly with an in-memory
//! `Connection` so we never need to spin up the Tauri runtime. The
//! `#[tauri::command]` wrapper (and the `DbState` plumbing it needs) is
//! covered by integration / manual verification, not by these unit tests.
//!
//! ## Pin of signatures for the IMPL phase (from the user's prompt — binding):
//!
//!   #[derive(serde::Serialize)]
//!   pub struct CategoriaDto {
//!       pub id: i64,
//!       pub nombre: String,
//!       pub grupo_pertenencia: String,  // matches CategoriaOption.tipo_flujo
//!   }
//!
//!   pub fn cmd_obtener_categorias_impl(conn: &Connection)
//!       -> Result<Vec<CategoriaDto>, String>
//!
//!   pub fn cmd_insert_transaccion_impl(conn: &Connection, t: &TransaccionInput)
//!       -> Result<i64, String>
//!
//!   pub fn cmd_listar_transacciones_impl(conn: &Connection, usuario_id: i64)
//!       -> Result<Vec<Transaccion>, String>
//!
//! Tests rely on the SAME `TransaccionInput` / `Transaccion` structs that
//! Slice 3 pinned at `crate::transacciones::repo` — the IMPL must reuse
//! them, NOT re-declare a parallel type. The 14-row seed in
//! `migrations/001_inicial.sql` already provides 4 INGRESO + 10 GASTO.

use app_diagnostico_financiero_local_lib::commands::{
    cmd_eliminar_transaccion_impl, cmd_insert_transaccion_impl,
    cmd_listar_transacciones_impl, cmd_obtener_categorias_impl, CategoriaDto,
};
use app_diagnostico_financiero_local_lib::migrations::apply_all;
use app_diagnostico_financiero_local_lib::transacciones::repo::{
    insert, list_by_user, TransaccionInput,
};
use rusqlite::Connection;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Opens a fresh in-memory DB, applies the canonical schema (which now
/// seeds BOTH the 14 categorias AND the 'Yo' usuario per the migration),
/// and returns the connection + the `Yo` user's id.
///
/// The `Yo` row is created by the `INSERT OR IGNORE` seed block in
/// `001_inicial.sql`, so the helper just reads its id — it does NOT
/// re-insert (that would violate the unique index on `Usuarios.nombre`).
///
/// Mirrors the fixture style used by `transacciones_repo_test.rs` so the
/// slice 7 tests look consistent with the slice 3 suite.
fn fresh_db_with_user() -> (Connection, i64) {
    let conn = Connection::open_in_memory().expect("open in-memory db");
    apply_all(&conn).expect("apply_all should succeed on a fresh db");

    let usuario_id: i64 = conn
        .query_row(
            "SELECT id FROM Usuarios WHERE nombre = ?1 LIMIT 1",
            rusqlite::params!["Yo"],
            |row| row.get(0),
        )
        .expect("seeded 'Yo' usuario must exist after apply_all");
    (conn, usuario_id)
}

/// Returns the first `Categorias.id` of the given `tipo_flujo`. We keep
/// this lookup brittle on purpose: if the seed ever shrinks below 1 row
/// per tipo_flujo, the test should panic loudly — it means the seed
/// contract broke, not the test.
fn categoria_id_for(conn: &Connection, tipo_flujo: &str) -> i64 {
    conn.query_row(
        "SELECT id FROM Categorias WHERE tipo_flujo = ?1 LIMIT 1",
        rusqlite::params![tipo_flujo],
        |r| r.get::<_, i64>(0),
    )
    .unwrap_or_else(|err| panic!("expected at least one Categoria for {tipo_flujo}: {err}"))
}

/// Builds a minimal-but-valid `TransaccionInput` for a Gasto row (must
/// include comportamiento + naturaleza_necesidad per the cross-column
/// CHECK in `migrations/001_inicial.sql`).
///
/// `usuario_id` se pasa como `Some(_)` porque en el test ejercitamos
/// `cmd_insert_transaccion_impl` directamente (no el wrapper
/// `cmd_insert_transaccion` que resolvería el perfil activo). Esto
/// refleja el contrato del command: el `_impl` confía en que el
/// wrapper ya rellenó el campo.
fn gasto_input(usuario_id: i64, categoria_id: i64, valor_centavos: i64) -> TransaccionInput {
    TransaccionInput {
        usuario_id: Some(usuario_id),
        tipo_flujo: "Gasto".to_string(),
        categoria_id,
        concepto: "Internet".to_string(),
        frecuencia: "Mensual".to_string(),
        comportamiento: Some("Fijo".to_string()),
        naturaleza_necesidad: Some("Necesario".to_string()),
        valor_centavos,
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

/// REQ-202 + REQ-201: `cmd_obtener_categorias_impl` MUST return ALL 14
/// categorias (4 INGRESO + 10 GASTO) seeded by the canonical migration.
///
/// Given: a fresh in-memory DB with migrations applied (seed = 14 rows).
/// When:  `cmd_obtener_categorias_impl(&conn)` is called.
/// Then:  the returned Vec has exactly 14 elements.
#[test]
fn slice7_cmd_obtener_categorias_returns_all_14() {
    let (conn, _usuario_id) = fresh_db_with_user();

    let cats: Vec<CategoriaDto> = cmd_obtener_categorias_impl(&conn)
        .expect("cmd_obtener_categorias_impl must succeed on a seeded db");

    assert_eq!(
        cats.len(),
        14,
        "REQ-201/REQ-202: cmd_obtener_categorias_impl must return ALL 14 categorias (seed)"
    );

    let ingresos = cats
        .iter()
        .filter(|c| c.grupo_pertenencia == "Ingreso")
        .count();
    let gastos = cats
        .iter()
        .filter(|c| c.grupo_pertenencia == "Gasto")
        .count();
    assert_eq!(ingresos, 4, "REQ-201: exactly 4 categorias are Ingreso");
    assert_eq!(gastos, 10, "REQ-201: exactly 10 categorias are Gasto");
}

/// REQ-201: each `CategoriaDto` MUST expose `{ id, nombre, grupo_pertenencia }`
/// with the right shape. The `grupo_pertenencia` field is the contract
/// that the React `TransaccionForm.CategoriaOption.tipo_flujo` consumes
/// — slicing 4 will rely on this exact field name to avoid an extra
/// transform layer.
///
/// Given: a fresh in-memory DB (14 seeded categorias).
/// When:  `cmd_obtener_categorias_impl(&conn)` is called.
/// Then:  every element is a struct with three fields and the types match.
#[test]
fn slice7_cmd_obtener_categorias_returns_correct_shape() {
    let (conn, _usuario_id) = fresh_db_with_user();

    let cats = cmd_obtener_categorias_impl(&conn)
        .expect("cmd_obtener_categorias_impl must succeed");

    assert!(!cats.is_empty(), "expected at least one categoria");

    for c in &cats {
        // `id` must be a positive integer (auto-increment starts at 1).
        assert!(
            c.id > 0,
            "CategoriaDto.id must be a positive integer, got {}",
            c.id
        );
        // `nombre` and `grupo_pertenencia` must be non-empty.
        assert!(
            !c.nombre.trim().is_empty(),
            "CategoriaDto.nombre must be a non-empty trimmed string"
        );
        assert!(
            !c.grupo_pertenencia.trim().is_empty(),
            "CategoriaDto.grupo_pertenencia must be a non-empty trimmed string"
        );
        // `grupo_pertenencia` must be one of the two canonical values
        // (matches the CHECK constraint on Categorias.tipo_flujo).
        assert!(
            c.grupo_pertenencia == "Ingreso" || c.grupo_pertenencia == "Gasto",
            "CategoriaDto.grupo_pertenencia must be 'Ingreso' or 'Gasto', got '{}'",
            c.grupo_pertenencia
        );
    }
}

/// REQ-202: `cmd_insert_transaccion_impl` MUST persist the row and
/// return the new id (a positive integer). A subsequent query against
/// `Transacciones` confirms the row is there.
///
/// Given: a fresh DB with one Usuario + one Categoria(Gasto) + a valid
///        `TransaccionInput` with `valor_centavos = 150_000_000` ($1.5M).
/// When:  `cmd_insert_transaccion_impl(&conn, &input)` is called.
/// Then:  the returned id > 0, AND the same row exists in the DB.
#[test]
fn slice7_cmd_insert_transaccion_persists_to_db() {
    let (conn, usuario_id) = fresh_db_with_user();
    let categoria_id = categoria_id_for(&conn, "Gasto");

    let input = gasto_input(usuario_id, categoria_id, 150_000_000);

    let new_id = cmd_insert_transaccion_impl(&conn, &input)
        .expect("cmd_insert_transaccion_impl must succeed for a valid input");

    assert!(
        new_id > 0,
        "cmd_insert_transaccion_impl must return a positive id, got {new_id}"
    );

    // Round-trip: query the DB and confirm the row was persisted with
    // the exact same valor_centavos (no lossy conversion).
    let stored: i64 = conn
        .query_row(
            "SELECT valor_centavos FROM Transacciones WHERE id = ?1",
            rusqlite::params![new_id],
            |r| r.get(0),
        )
        .expect("select inserted row");
    assert_eq!(
        stored, 150_000_000,
        "REQ-202: cmd_insert_transaccion_impl must persist valor_centavos exactly (no drift)"
    );

    // Cross-check: the underlying repo helper agrees.
    let all = list_by_user(&conn, usuario_id).expect("list_by_user");
    assert_eq!(
        all.len(),
        1,
        "REQ-202: exactly one row should be persisted for this user"
    );
    assert_eq!(
        all[0].id, new_id,
        "REQ-202: the id returned by the command must match the id surfaced by list_by_user"
    );
}

/// REQ-202 + REQ-602 (CHECK constraints): when the input has
/// `valor_centavos = 0`, the SQL CHECK `valor_centavos > 0` rejects the
/// insert. The command MUST propagate this as `Err(_)`.
///
/// Given: a fresh DB with one Usuario + one Categoria(Gasto) + an input
///        with `valor_centavos = 0` (invalid).
/// When:  `cmd_insert_transaccion_impl(&conn, &input)` is called.
/// Then:  it returns `Err(_)`. No row is persisted.
#[test]
fn slice7_cmd_insert_transaccion_validates_value_positive() {
    let (conn, usuario_id) = fresh_db_with_user();
    let categoria_id = categoria_id_for(&conn, "Gasto");

    let bad_input = gasto_input(usuario_id, categoria_id, 0);

    let result = cmd_insert_transaccion_impl(&conn, &bad_input);
    assert!(
        result.is_err(),
        "REQ-202 + REQ-602: cmd_insert_transaccion_impl MUST reject valor_centavos = 0 (CHECK constraint)"
    );

    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM Transacciones", [], |r| r.get(0))
        .expect("count Transacciones");
    assert_eq!(
        count, 0,
        "REQ-202: a rejected insert must NOT leave a phantom row in the table"
    );
}

/// REQ-202 + REQ-603 (multi-profile isolation): the command MUST filter
/// strictly by `usuario_id`. Two rows for user X and one row for user Y
/// must surface only the X rows through `cmd_listar_transacciones_impl`.
///
/// Given: two `Usuarios` (X, Y) and 3 rows (2 for X, 1 for Y).
/// When:  `cmd_listar_transacciones_impl(&conn, X)` is called.
/// Then:  the returned Vec has exactly 2 rows, all with `usuario_id == X`.
#[test]
fn slice7_cmd_listar_transacciones_returns_only_user_rows() {
    let (conn, x_id) = fresh_db_with_user();
    let y_id: i64 = conn
        .execute(
            "INSERT INTO Usuarios (nombre) VALUES (?1)",
            rusqlite::params!["Other"],
        )
        .map(|_| conn.last_insert_rowid())
        .expect("insert second usuario");
    let categoria_id = categoria_id_for(&conn, "Gasto");

    insert(&conn, &gasto_input(x_id, categoria_id, 100_000))
        .expect("insert tx for X");
    insert(&conn, &gasto_input(x_id, categoria_id, 200_000))
        .expect("insert tx for X");
    insert(&conn, &gasto_input(y_id, categoria_id, 999_999))
        .expect("insert tx for Y");

    let rows = cmd_listar_transacciones_impl(&conn, x_id)
        .expect("cmd_listar_transacciones_impl must succeed");

    assert_eq!(
        rows.len(),
        2,
        "REQ-202 + REQ-603: cmd_listar_transacciones_impl must return ONLY the rows of the requested user"
    );
    for row in &rows {
        assert_eq!(
            row.usuario_id, x_id,
            "REQ-603: every returned row must belong to the requested user (no leak)"
        );
        assert_ne!(
            row.usuario_id, y_id,
            "REQ-603: rows from other profiles must NEVER leak into the result"
        );
    }
}

/// REQ-202 (Scenario: "Eliminar transacción") + REQ-602: a new command
/// `cmd_eliminar_transaccion_impl` MUST remove the row by id, and a
/// follow-up list MUST reflect the deletion (the table no longer
/// contains the row).
///
/// Given: a fresh DB with the seeded 'Yo' user + a Gasto categoria, and
///        one valid TransaccionInput inserted via `cmd_insert_transaccion_impl`.
/// When:  `cmd_eliminar_transaccion_impl(&conn, id)` is called with the
///        returned id.
/// Then:  a subsequent `cmd_listar_transacciones_impl(&conn, usuario_id)`
///        returns 0 rows (the row is gone).
///
/// RED phase: this test fails to compile because
/// `cmd_eliminar_transaccion_impl` does NOT exist in
/// `crate::commands` yet. The IMPL phase will introduce the helper
/// with signature `pub fn cmd_eliminar_transaccion_impl(conn: &Connection, id: i64) -> Result<(), String>`
/// that delegates to `repo::delete`.
#[test]
fn req_202_cmd_eliminar_transaccion_removes_row() {
    let (conn, usuario_id) = fresh_db_with_user();
    let categoria_id = categoria_id_for(&conn, "Gasto");

    let input = TransaccionInput {
        usuario_id: Some(usuario_id),
        tipo_flujo: "Gasto".to_string(),
        categoria_id,
        concepto: "Test delete".to_string(),
        frecuencia: "Mensual".to_string(),
        comportamiento: Some("Fijo".to_string()),
        naturaleza_necesidad: Some("Necesario".to_string()),
        valor_centavos: 100_000,
    };

    let id = cmd_insert_transaccion_impl(&conn, &input).expect("insert should succeed");

    // Sanity check: the row exists before the delete.
    let before = cmd_listar_transacciones_impl(&conn, usuario_id).expect("list before");
    assert_eq!(
        before.len(),
        1,
        "REQ-202: should have exactly 1 row before delete"
    );
    assert_eq!(
        before[0].id, id,
        "REQ-202: the listed row must be the one we inserted"
    );

    // Delete it.
    cmd_eliminar_transaccion_impl(&conn, id).expect("delete should succeed");

    // Post-condition: the row is gone — the list is empty.
    let after = cmd_listar_transacciones_impl(&conn, usuario_id).expect("list after");
    assert_eq!(
        after.len(),
        0,
        "REQ-202: should have 0 rows after delete (hard delete, not soft)"
    );
}