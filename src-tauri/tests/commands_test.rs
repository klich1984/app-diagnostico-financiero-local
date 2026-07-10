//! Tests for Slice 9 (perfil multi-usuario): 3 new commands
//! `cmd_obtener_perfiles`, `cmd_crear_perfil`, `cmd_obtener_perfil`.
//!
//! Spec:    `openspec/changes/mvp-financiero-local-first/spec.md` §REQ-501
//!          (selector de perfil al abrir la aplicacion) + §REQ-603
//!          (soporte multi-perfil, aislamiento de transacciones por
//!          perfil).
//! Design:  `openspec/changes/mvp-financiero-local-first/design.md` §6.1
//!          (capa `commands/`) + §6.2 (contratos IPC) + §11 (seccion
//!          multi-profile).
//! Tasks:   T-501 (selector de perfil) + T-901 (cmd_obtener_perfil).
//! Test #:  slice 9 / backend / REQ-501 + REQ-603 (4 tests) +
//!          slice 7 / backend / REQ-202 pre-existing (`req_202_cmd_*
//!          eliminar_transaccion_removes_row`).
//!
//! RED PHASE: this file references symbols that do NOT exist in
//! `crate::commands` yet:
//!   * `cmd_obtener_perfiles_impl(&Connection) -> Result<Vec<UsuarioDto>, String>`
//!   * `cmd_crear_perfil_impl(&Connection, String, i64) -> Result<i64, String>`
//!   * `cmd_obtener_perfil_impl(&Connection, i64) -> Result<UsuarioDto, String>`
//!   * `struct UsuarioDto { id, nombre, salario_personal_objetivo_centavos, modo_mejorado_activo }`
//!
//! `cargo test --no-run` MUST fail to compile because of these
//! unresolved symbols. That is the expected RED state. The IMPL phase
//! will introduce:
//!
//!   ```ignore
//!   #[derive(serde::Serialize, Clone, Debug)]
//!   pub struct UsuarioDto {
//!       pub id: i64,
//!       pub nombre: String,
//!       pub salario_personal_objetivo_centavos: i64,
//!       pub modo_mejorado_activo: bool,
//!   }
//!   ```
//!
//! in `commands.rs`, plus the 3 `_impl` functions described above.
//!
//! ## Why this tests `*_impl` (not the `#[tauri::command]` wrapper)
//!
//! Same rationale as the existing slice 7 tests above: `#[tauri::command]`
//! wrappers need a live Tauri runtime (AppHandle + State + main loop).
//! The pure `_impl(&Connection)` form is testable against an in-memory
//! SQLite DB without spinning anything up. See the top-of-file comment
//! of this file for the canonical pattern.
//!
//! ## `Usuario` table reference
//!
//! The seed in `migrations/001_inicial.sql` inserts `('Yo', 50000000)`
//! via `INSERT OR IGNORE`. `Usuarios.nombre` has a UNIQUE index
//! `idx_usuarios_nombre_unique` (case-insensitive). `Usuarios` also
//! has CHECK constraints:
//!   * `length(trim(nombre)) > 0`  (rechaza nombre vacio)
//!   * `salario_personal_objetivo_centavos >= 0`
//!
//! Our `cmd_crear_perfil_impl` MUST enforce both — the empty-name test
//! below exercises the first one explicitly.

use app_diagnostico_financiero_local_lib::commands::{
    cmd_crear_perfil_impl, cmd_eliminar_simulacion_impl, cmd_eliminar_transaccion_impl,
    cmd_insert_transaccion_impl, cmd_listar_simulaciones_impl, cmd_listar_transacciones_impl,
    cmd_obtener_categorias_impl, cmd_obtener_perfil_impl, cmd_obtener_perfiles_impl,
    cmd_upsert_simulacion_impl, CategoriaDto, SimulacionCompletaDto, UsuarioDto,
};
use app_diagnostico_financiero_local_lib::migrations::apply_all;
use app_diagnostico_financiero_local_lib::transacciones::repo::{
    insert, list_by_user, TransaccionInput,
};
use rusqlite::Connection;

// ---------------------------------------------------------------------------
// Helpers (shared with slice 7 tests above — duplicated here so this file
// can stand alone as a coherent test suite for slice 9 reviewers).
// ---------------------------------------------------------------------------

/// Opens a fresh in-memory DB, applies the canonical schema (which seeds
/// BOTH the 14 categorias AND the 'Yo' usuario per the migration), and
/// returns the connection + the `Yo` user's id.
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

/// Returns the first `Categorias.id` of the given `tipo_flujo`. If the
/// seed ever shrinks below 1 row per tipo_flujo, this panics — that
/// means the seed contract broke, not the test.
fn categoria_id_for(conn: &Connection, tipo_flujo: &str) -> i64 {
    conn.query_row(
        "SELECT id FROM Categorias WHERE tipo_flujo = ?1 LIMIT 1",
        rusqlite::params![tipo_flujo],
        |r| r.get::<_, i64>(0),
    )
    .unwrap_or_else(|err| panic!("expected at least one Categoria for {tipo_flujo}: {err}"))
}

/// Builds a minimal-but-valid `TransaccionInput` for a Gasto row.
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
// Slice 7 pre-existing tests (kept verbatim so the file is a coherent
// integration suite; subsequent slices append, never delete, prior tests).
// ---------------------------------------------------------------------------

/// REQ-201/REQ-202: catalog seed (14 categorias).
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
}

/// REQ-202: insert persists to DB and returns positive id.
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

/// REQ-202: list filters strictly by user (REQ-603 isolation).
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

    insert(&conn, &gasto_input(x_id, categoria_id, 100_000)).expect("insert tx for X");
    insert(&conn, &gasto_input(x_id, categoria_id, 200_000)).expect("insert tx for X");
    insert(&conn, &gasto_input(y_id, categoria_id, 999_999)).expect("insert tx for Y");

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
    }
}

/// REQ-202 (delete) + REQ-602: hard delete by id.
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

    let before = cmd_listar_transacciones_impl(&conn, usuario_id).expect("list before");
    assert_eq!(before.len(), 1, "REQ-202: should have exactly 1 row before delete");
    assert_eq!(before[0].id, id, "REQ-202: the listed row must be the one we inserted");

    cmd_eliminar_transaccion_impl(&conn, id).expect("delete should succeed");

    let after = cmd_listar_transacciones_impl(&conn, usuario_id).expect("list after");
    assert_eq!(
        after.len(),
        0,
        "REQ-202: should have 0 rows after delete (hard delete, not soft)"
    );
}

// ===========================================================================
// Slice 9: REQ-501 (selector multi-perfil) + REQ-603 (aislamiento por perfil)
// ===========================================================================
//
// Surface tests para los 3 nuevos comandos `*_impl`:
//
//   * `cmd_obtener_perfiles_impl(&Connection) -> Result<Vec<UsuarioDto>, String>`
//   * `cmd_crear_perfil_impl(&Connection, nombre: String, salario_centavos: i64)
//                              -> Result<i64, String>`
//   * `cmd_obtener_perfil_impl(&Connection, id: i64) -> Result<UsuarioDto, String>`
//
// y el struct:
//
//   * `pub struct UsuarioDto {
//        pub id: i64,
//        pub nombre: String,
//        pub salario_personal_objetivo_centavos: i64,
//        pub modo_mejorado_activo: bool,
//      }`
//
// El contrato del slice 9 (decisión de producto #6) es:
//
//   * El selector al abrir muestra TODOS los perfiles disponibles.
//   * `cmd_crear_perfil` rechaza nombre vacio (CHECK constraint de la tabla).
//   * El salario por defecto del 'Yo' sembrado es 50_000_000 centavos
//     (= $500.000,00 pesos; ver `001_inicial.sql` linea 178).
//   * `cmd_obtener_perfil(id)` devuelve UN solo perfil por id (lookup 1-a-1).
//
// Estos 4 tests cubren los 3 escenarios de `spec.md §REQ-501` y el
// shape del DTO.
//
// ===========================================================================

/// REQ-501 + REQ-603 (Scenario "Selector de perfil al iniciar"):
/// `cmd_obtener_perfiles_impl` MUST return ALL profiles in the table. The
/// seed guarantees at least 'Yo' exists (id=1, salario=50000000,
/// modo_mejorado_activo=0/false). On a fresh DB, the returned Vec has
/// at least one element AND 'Yo' is present by name.
///
/// Given: fresh in-memory DB (only the 'Yo' seed row from
///        `001_inicial.sql`).
/// When:  `cmd_obtener_perfiles_impl(&conn)` is called.
/// Then:  the returned Vec has >=1 element, AND a profile with
///        `nombre == "Yo"` is in it.
#[test]
fn req_501_cmd_obtener_perfiles_returns_all_usuarios() {
    let (conn, _usuario_id) = fresh_db_with_user();

    let perfiles = cmd_obtener_perfiles_impl(&conn)
        .expect("req_501: cmd_obtener_perfiles_impl must succeed on a seeded db");

    assert!(
        perfiles.len() >= 1,
        "REQ-501: cmd_obtener_perfiles_impl must return at least 1 profile (the seeded 'Yo'); got {}",
        perfiles.len()
    );

    let names: Vec<String> = perfiles.iter().map(|p| p.nombre.clone()).collect();
    assert!(
        names.contains(&"Yo".to_string()),
        "REQ-501: cmd_obtener_perfiles_impl MUST include the seeded 'Yo' profile; got {names:?}"
    );
}

/// REQ-501 + REQ-603: `cmd_crear_perfil_impl` MUST insert a new `Usuarios`
/// row, return its autoincrement id (>0), AND make it visible to a
/// subsequent `cmd_obtener_perfiles_impl` call. Salary is stored in
/// centavos (i64) exactly — no floating-point conversion, no lossy
/// rounding.
///
/// Given: fresh DB with the 'Yo' seed row + a request to create
///        "Nuevo" with `salario_centavos = 75_000_000`
///        (== $750.000,00 pesos).
/// When:  `cmd_crear_perfil_impl(&conn, "Nuevo", 75_000_000)` is called.
/// Then:  the returned id > 0; the same profile shows up in the next
///        `cmd_obtener_perfiles_impl` call with the right salary.
#[test]
fn req_501_cmd_crear_perfil_inserts_new_usuario() {
    let (conn, _yo_id) = fresh_db_with_user();

    let id = cmd_crear_perfil_impl(&conn, "Nuevo".to_string(), 75_000_000)
        .expect("req_501: cmd_crear_perfil_impl must succeed for a valid input");

    assert!(
        id > 0,
        "REQ-501: cmd_crear_perfil_impl must return a positive id, got {id}"
    );

    // The new profile MUST be visible to the list command.
    let perfiles = cmd_obtener_perfiles_impl(&conn)
        .expect("req_501: follow-up cmd_obtener_perfiles_impl must succeed");

    let nuevo = perfiles
        .iter()
        .find(|p| p.nombre == "Nuevo")
        .expect("REQ-501: the newly-created 'Nuevo' profile MUST appear in the list");

    assert_eq!(
        nuevo.id, id,
        "REQ-501: the id reported by cmd_obtener_perfil must match the insert id"
    );
    assert_eq!(
        nuevo.salario_personal_objetivo_centavos, 75_000_000,
        "REQ-501: cmd_crear_perfil_impl must persist salario_personal_objetivo_centavos exactly (no drift)"
    );
}

/// REQ-501 + REQ-602 (CHECK constraints): `cmd_crear_perfil_impl` MUST
/// reject a `nombre` that is empty (or whitespace-only). The
/// `Usuarios.nombre` CHECK constraint is `length(trim(nombre)) > 0`,
/// which `rusqlite::Connection::execute` translates to a `CHECK
/// constraint failed` error that the command MUST propagate as `Err(_)`.
/// No row is inserted.
///
/// Given: fresh DB with the 'Yo' seed row + an empty name.
/// When:  `cmd_crear_perfil_impl(&conn, "", 50_000_000)` is called.
/// Then:  the call returns `Err(_)` AND the `Usuarios` row count is
///        unchanged (still just 'Yo').
#[test]
fn req_501_cmd_crear_perfil_rejects_empty_nombre() {
    let (conn, _yo_id) = fresh_db_with_user();

    let result = cmd_crear_perfil_impl(&conn, "".to_string(), 50_000_000);

    assert!(
        result.is_err(),
        "REQ-501 + REQ-602: cmd_crear_perfil_impl MUST reject an empty nombre (CHECK constraint)"
    );

    // Post-condition: no phantom row was inserted.
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM Usuarios", [], |r| r.get(0))
        .expect("count Usuarios");
    assert_eq!(
        count, 1,
        "REQ-501: a rejected insert must NOT leave a phantom row in Usuarios (still just 'Yo')"
    );
}

/// REQ-501 (Scenarios: "Selector de perfil al iniciar" + "Aislamiento
/// de datos por perfil"): `cmd_obtener_perfil_impl` MUST fetch a single
/// `Usuarios` row by id, projecting it into a `UsuarioDto` with all
/// four fields populated. Specifically the seeded 'Yo' row MUST surface
/// with `id = 1`, `nombre = "Yo"`, `salario_personal_objetivo_centavos
/// = 50_000_000`, `modo_mejorado_activo = false` (the seed uses
/// `INSERT OR IGNORE ... 50000000` without setting
/// `modo_mejorado_activo`; that column defaults to 0 per the table
/// schema, which serializes to `false` in the DTO).
///
/// Given: a fresh DB + the 'Yo' row (id=1) from the seed.
/// When:  the id is looked up via `conn.query_row` and then passed to
///        `cmd_obtener_perfil_impl`.
/// Then:  the returned `UsuarioDto` has `nombre == "Yo"` AND
///        `salario_personal_objetivo_centavos == 50_000_000`.
#[test]
fn req_501_cmd_obtener_perfil_returns_by_id() {
    let (conn, _yo_id) = fresh_db_with_user();

    let yo_id: i64 = conn
        .query_row::<i64, _, _>(
            "SELECT id FROM Usuarios WHERE nombre = ?1",
            rusqlite::params!["Yo"],
            |r| r.get(0),
        )
        .expect("seeded 'Yo' usuario must exist after apply_all");

    let perfil = cmd_obtener_perfil_impl(&conn, yo_id)
        .expect("req_501: cmd_obtener_perfil_impl must succeed for the seeded 'Yo'");

    assert_eq!(
        perfil.nombre, "Yo",
        "REQ-501: cmd_obtener_perfil_impl must return the right nombre for the lookup id"
    );
    assert_eq!(
        perfil.salario_personal_objetivo_centavos, 50_000_000,
        "REQ-501: cmd_obtener_perfil_impl must project salario_personal_objetivo_centavos exactly (seeding 50_000_000)"
    );
    assert_eq!(
        perfil.id, yo_id,
        "REQ-501: cmd_obtener_perfil_impl must echo back the id we asked for"
    );
}

// ===========================================================================
// Slice 11: REQ-602 (simulador commands) + REQ-603 (panel UI support)
// ===========================================================================
//
// Surface tests para los 3 nuevos comandos del Simulador:
//
//   * `cmd_listar_simulaciones_impl(&Connection, usuario_id: i64) -> Result<Vec<SimulacionCompletaDto>, String>`
//   * `cmd_upsert_simulacion_impl(&Connection, transaccion_id: i64,
//                                 nuevo_valor_centavos: i64, usuario_id: i64)
//                          -> Result<i64, String>`
//   * `cmd_eliminar_simulacion_impl(&Connection, transaccion_id: i64) -> Result<(), String>`
//
// y el struct:
//
//   * `pub struct SimulacionCompletaDto { id, usuario_id, transaccion_id,
//                                        nuevo_valor_centavos, created_at, updated_at }`
//
// Decisión de producto del slice 11 (Simulador UI):
//   * El backend expone CRUD de propuestas (`Simulador` table, ya en el
//     schema, tiene `UNIQUE(transaccion_id)` y `CHECK(nuevo_valor_centavos >= 0)`).
//   * El comando `upsert` es idempotente (INSERT ... ON CONFLICT DO UPDATE).
//   * El listado filtra estrictamente por `usuario_id` (REQ-603 — aislamiento
//     por perfil).
//
// ===========================================================================

/// REQ-602 + REQ-603 (slice 11 / backend): `cmd_listar_simulaciones_impl`
/// MUST return an empty Vec on a fresh DB. The `Simulador` table is
/// empty until the user starts moving sliders in the Panel Simulador;
/// the list command MUST NOT fabricate rows, MUST NOT return an error.
///
/// Given: fresh in-memory DB (no `Simulador` rows).
/// When:  `cmd_listar_simulaciones_impl(&conn, 1)` is called.
/// Then:  the call returns `Ok(vec![])` with `len() == 0`.
#[test]
fn req_602_cmd_listar_simulaciones_returns_empty_initially() {
    let (conn, _yo_id) = fresh_db_with_user();

    let sims: Vec<SimulacionCompletaDto> = cmd_listar_simulaciones_impl(&conn, 1)
        .expect("req_602: cmd_listar_simulaciones_impl must succeed on an empty Simulador table");

    assert_eq!(
        sims.len(),
        0,
        "REQ-602: the freshly-seeded DB has no Simulador rows; the list MUST be empty"
    );
}

/// REQ-602 + REQ-603 (slice 11 / backend): `cmd_upsert_simulacion_impl`
/// MUST insert a new `Simulador` row when there is no existing row for
/// the given `transaccion_id` (the `UNIQUE(transaccion_id)` constraint
/// guarantees there's at most one row per transaction).
///
/// Given: a freshly-seeded DB + a non-essential `Gasto` transaction
///        (`naturaleza_necesidad = "No necesario"`).
/// When:  `cmd_upsert_simulacion_impl(&conn, tx_id, 100_000, 1)` is
///        called.
/// Then:  the call returns `Ok(id > 0)` AND the subsequent
///        `cmd_listar_simulaciones_impl(&conn, 1)` shows exactly one
///        row with the same `transaccion_id` and the same
///        `nuevo_valor_centavos`.
#[test]
fn req_602_cmd_upsert_simulacion_inserts_new_simulation() {
    let (conn, yo_id) = fresh_db_with_user();
    let categoria_id = categoria_id_for(&conn, "Gasto");

    let input = TransaccionInput {
        usuario_id: Some(yo_id),
        tipo_flujo: "Gasto".to_string(),
        categoria_id,
        concepto: "Test simulador insert".to_string(),
        frecuencia: "Mensual".to_string(),
        comportamiento: Some("Variable".to_string()),
        naturaleza_necesidad: Some("No necesario".to_string()),
        valor_centavos: 300_000,
    };
    let tx_id = insert(&conn, &input).expect("insert tx for the simulation");

    cmd_upsert_simulacion_impl(&conn, tx_id, 100_000, yo_id)
        .expect("req_602: cmd_upsert_simulacion_impl must succeed for a fresh (tx_id)");

    let sims = cmd_listar_simulaciones_impl(&conn, yo_id)
        .expect("req_602: cmd_listar_simulaciones_impl must succeed after upsert");

    assert_eq!(
        sims.len(),
        1,
        "REQ-602: after the first upsert there MUST be exactly one Simulador row for this user"
    );
    assert_eq!(
        sims[0].transaccion_id, tx_id,
        "REQ-602: the listed row MUST belong to the inserted tx_id"
    );
    assert_eq!(
        sims[0].nuevo_valor_centavos, 100_000,
        "REQ-602: the listed row MUST carry the nuevo_valor_centavos we sent"
    );
    assert_eq!(
        sims[0].usuario_id, yo_id,
        "REQ-603: the listed row MUST be owned by the resolved usuario_id"
    );
}

/// REQ-602 (slice 11 / backend, upsert semantics): calling
/// `cmd_upsert_simulacion_impl` twice on the SAME `transaccion_id` MUST
/// update the existing row in place (not duplicate it). The
/// `UNIQUE(transaccion_id)` constraint guarantees there's at most one
/// row per transaction; combined with `INSERT ... ON CONFLICT DO
/// UPDATE`, the second call MUST keep `len == 1` but refresh
/// `nuevo_valor_centavos`.
///
/// Given: a Simulador row already inserted via `cmd_upsert_simulacion_impl`.
/// When:  the same `cmd_upsert_simulacion_impl` is called again with a
///        different `nuevo_valor_centavos`.
/// Then:  the resulting list has exactly one row, and that row carries
///        the NEW value.
#[test]
fn req_602_cmd_upsert_simulacion_updates_existing() {
    let (conn, yo_id) = fresh_db_with_user();
    let categoria_id = categoria_id_for(&conn, "Gasto");

    let input = TransaccionInput {
        usuario_id: Some(yo_id),
        tipo_flujo: "Gasto".to_string(),
        categoria_id,
        concepto: "Test simulador update".to_string(),
        frecuencia: "Mensual".to_string(),
        comportamiento: Some("Variable".to_string()),
        naturaleza_necesidad: Some("No necesario".to_string()),
        valor_centavos: 300_000,
    };
    let tx_id = insert(&conn, &input).expect("insert tx for the simulation");

    // First upsert — inserts.
    cmd_upsert_simulacion_impl(&conn, tx_id, 100_000, yo_id)
        .expect("req_602: first upsert must succeed");
    // Second upsert — updates in place.
    cmd_upsert_simulacion_impl(&conn, tx_id, 50_000, yo_id)
        .expect("req_602: second upsert must succeed (idempotent on conflict)");

    let sims = cmd_listar_simulaciones_impl(&conn, yo_id)
        .expect("req_602: cmd_listar_simulaciones_impl must succeed after double-upsert");

    assert_eq!(
        sims.len(),
        1,
        "REQ-602: a second upsert on the same transaccion_id MUST NOT duplicate the row (UNIQUE constraint)"
    );
    assert_eq!(
        sims[0].transaccion_id, tx_id,
        "REQ-602: the existing row MUST still belong to the same transaccion_id"
    );
    assert_eq!(
        sims[0].nuevo_valor_centavos, 50_000,
        "REQ-602: the second upsert MUST have refreshed nuevo_valor_centavos (in-place update)"
    );
}

/// REQ-602 (slice 11 / backend, delete semantics):
/// `cmd_eliminar_simulacion_impl(transaccion_id)` MUST delete the
/// proposal for that transaction (no-op if absent). After deletion,
/// the listing MUST no longer contain that row.
///
/// Given: an upserted simulation.
/// When:  `cmd_eliminar_simulacion_impl(&conn, tx_id)` is called.
/// Then:  the subsequent list is empty (for that `tx_id`).
/// NOTE: extra coverage beyond the minimum — keeps the test plan
/// symmetric with `list_by_user` / `delete` patterns from slice 7.
#[test]
fn req_602_cmd_eliminar_simulacion_removes_row() {
    let (conn, yo_id) = fresh_db_with_user();
    let categoria_id = categoria_id_for(&conn, "Gasto");

    let input = TransaccionInput {
        usuario_id: Some(yo_id),
        tipo_flujo: "Gasto".to_string(),
        categoria_id,
        concepto: "Test simulador delete".to_string(),
        frecuencia: "Mensual".to_string(),
        comportamiento: Some("Variable".to_string()),
        naturaleza_necesidad: Some("No necesario".to_string()),
        valor_centavos: 300_000,
    };
    let tx_id = insert(&conn, &input).expect("insert tx for the simulation");

    cmd_upsert_simulacion_impl(&conn, tx_id, 100_000, yo_id)
        .expect("req_602: upsert before delete");
    cmd_eliminar_simulacion_impl(&conn, tx_id)
        .expect("req_602: cmd_eliminar_simulacion_impl must succeed");

    let sims = cmd_listar_simulaciones_impl(&conn, yo_id)
        .expect("req_602: cmd_listar_simulaciones_impl must succeed after delete");
    assert!(
        sims.is_empty(),
        "REQ-602: after cmd_eliminar_simulacion_impl the listing MUST be empty"
    );
}
