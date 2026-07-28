//! Tests for T-507 (change `mvp-cierre-modal-y-tab5`):
//! `cmd_update_salario_objetivo_impl` — comando backend que persiste
//! el salario personal objetivo de un perfil (HU-502 / REQ-502-D1-3).
//!
//! Spec:    `openspec/changes/mvp-cierre-modal-y-tab5/spec.md`
//!          §REQ-502-D1-3 (guardado con valor válido).
//! Design:  `openspec/changes/mvp-cierre-modal-y-tab5/design.md`
//!          §2 (contrato del comando Rust), R-1 (shape del payload).
//! Tasks:   T-507 RED → T-508 GREEN.
//! Test #:  4 tests (update exitoso, negativo rechazado,
//!          > $1B rechazado, perfil inexistente rechazado).
//!
//! ## RED PHASE
//!
//! Este archivo referencia `cmd_update_salario_objetivo_impl` que NO
//! existe todavía en `crate::commands`. `cargo test --no-run` DEBE
//! fallar en la etapa de compilación. Ese ES el estado RED esperado.
//!
//! La fase IMPL (T-508) agregará a `commands.rs`:
//!
//! ```ignore
//! pub struct UpdateSalarioObjetivoInput {
//!     pub perfil_id: i64,
//!     pub salario_objetivo_centavos: i64,
//! }
//!
//! pub fn cmd_update_salario_objetivo_impl(
//!     conn: &Connection,
//!     input: &UpdateSalarioObjetivoInput,
//! ) -> Result<(), String>
//!
//! #[tauri::command]
//! pub async fn cmd_update_salario_objetivo(
//!     app: tauri::AppHandle,
//!     input: UpdateSalarioObjetivoInput,
//! ) -> Result<(), String>
//! ```
//!
//! ## Por qué se prueba `*_impl` y no el wrapper `#[tauri::command]`
//!
//! Mismo patrón que el resto del proyecto: el wrapper `#[tauri::command]`
//! necesita un runtime Tauri activo (AppHandle + loop async). La variante
//! `_impl(&Connection, &Input)` es pura y testeable contra una DB en
//! memoria sin levantar ningún runtime. Ver `commands.rs` §docblock.
//!
//! ## Constraints del schema (Usuarios)
//!
//! La migración `001_inicial.sql` declara en la tabla `Usuarios`:
//!   CHECK (salario_personal_objetivo_centavos >= 0)
//! El backend también debe rechazar valores > 100_000_000_000 centavos
//! ($1.000.000.000 pesos) — límite pineado en `design.md` R-2.

use app_diagnostico_financiero_local_lib::commands::{
    cmd_update_salario_objetivo_impl, UpdateSalarioObjetivoInput,
};
use app_diagnostico_financiero_local_lib::migrations::apply_all;
use rusqlite::Connection;

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

/// Abre una DB en memoria, aplica todas las migraciones (que incluyen el
/// seed del usuario 'Yo') y devuelve la conexión + el `id` de 'Yo'.
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

/// REQ-502-D1-3 / T-507 — update exitoso:
/// Dado un perfil existente y un valor válido ($7.200.000 = 720_000_000
/// centavos), `cmd_update_salario_objetivo_impl` debe retornar `Ok(())`
/// y persistir el nuevo valor en la columna
/// `salario_personal_objetivo_centavos` de `Usuarios`.
#[test]
fn t507_update_salario_exitoso() {
    let (conn, usuario_id) = fresh_db_with_user();

    let input = UpdateSalarioObjetivoInput {
        perfil_id: usuario_id,
        salario_objetivo_centavos: 720_000_000,
    };

    let result = cmd_update_salario_objetivo_impl(&conn, &input);
    assert!(
        result.is_ok(),
        "cmd_update_salario_objetivo_impl debe retornar Ok para un valor válido; got: {result:?}"
    );

    // Verifica persistencia en DB.
    let stored: i64 = conn
        .query_row(
            "SELECT salario_personal_objetivo_centavos FROM Usuarios WHERE id = ?1",
            rusqlite::params![usuario_id],
            |r| r.get(0),
        )
        .expect("usuario debe existir en DB");

    assert_eq!(
        stored, 720_000_000,
        "el valor persistido en DB debe coincidir con el enviado"
    );
}

/// REQ-502-D1-5 / T-507 — negativo rechazado:
/// Un valor negativo (-1 centavo) viola el CHECK constraint del schema
/// (`salario_personal_objetivo_centavos >= 0`). El comando debe retornar
/// `Err(...)` sin modificar la DB.
#[test]
fn t507_update_salario_negativo_rechazado() {
    let (conn, usuario_id) = fresh_db_with_user();

    let input = UpdateSalarioObjetivoInput {
        perfil_id: usuario_id,
        salario_objetivo_centavos: -1,
    };

    let result = cmd_update_salario_objetivo_impl(&conn, &input);
    assert!(
        result.is_err(),
        "cmd_update_salario_objetivo_impl debe retornar Err para valor negativo"
    );
}

/// REQ-502-D1-6 / T-507 — excede límite rechazado:
/// Un valor superior a $1.000.000.000 pesos (100_000_000_001 centavos)
/// debe ser rechazado por el backend. El límite máximo permitido es
/// 100_000_000_000 centavos (pineado en design.md R-2).
#[test]
fn t507_update_salario_excede_limite_rechazado() {
    let (conn, usuario_id) = fresh_db_with_user();

    let input = UpdateSalarioObjetivoInput {
        perfil_id: usuario_id,
        salario_objetivo_centavos: 100_000_000_001,
    };

    let result = cmd_update_salario_objetivo_impl(&conn, &input);
    assert!(
        result.is_err(),
        "cmd_update_salario_objetivo_impl debe retornar Err para valor > $1B"
    );
}

/// T-507 — perfil inexistente rechazado:
/// Si `perfil_id` no corresponde a ningún usuario en la DB, el UPDATE
/// no afecta ninguna fila. El comando debe retornar `Err(...)` indicando
/// que el perfil no fue encontrado.
#[test]
fn t507_update_perfil_inexistente_rechazado() {
    let (conn, _usuario_id) = fresh_db_with_user();

    let input = UpdateSalarioObjetivoInput {
        perfil_id: 99999,
        salario_objetivo_centavos: 500_000_000,
    };

    let result = cmd_update_salario_objetivo_impl(&conn, &input);
    assert!(
        result.is_err(),
        "cmd_update_salario_objetivo_impl debe retornar Err cuando perfil_id no existe"
    );
}
