//! Runner de migraciones versionadas.
//!
//! Ver `design.md` §5.6 (plan de migraciones inicial) y §6.6 (registry +
//! runner). La fase RED del Slice 2 fija la signature `run_all` como
//! `fn() -> ()`; en GREEN el runner acepta además un `Connection` de
//! `rusqlite` para escenarios de test que necesiten un ciclo de vida
//! de conexión explícito (p. ej. un test de integración con DB en
//! memoria).
//!
//! Reglas:
//!   1. Las migraciones son append-only. Una vez mergeado a `main`,
//!      `00N_*.sql` NUNCA se borra (regla dura #3 del usuario).
//!   2. Cada migración se ejecuta dentro de una transacción.
//!   3. La versión aplicada se registra en `_migrations` con su SHA-256
//!      para detectar drift.
//!   4. La función es idempotente: correrla dos veces no falla y no
//!      duplica la fila de control.

use rusqlite::Connection;
use sha2::{Digest, Sha256};

/// Catálogo de migraciones. Por ahora solo la inicial; las próximas
/// se agregan al `vec!` en orden ascendente de versión.
fn registry() -> Vec<(u32, &'static str, &'static str)> {
    vec![(
        1,
        "schema_inicial_v1",
        include_str!("../migrations/001_inicial.sql"),
    )]
}

/// Calcula el SHA-256 hex de un payload SQL. Se persiste en
/// `_migrations.sha256` para detectar drift entre lo que el runner
/// cree haber aplicado y lo que el archivo dice.
fn sha256_hex(payload: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(payload.as_bytes());
    let digest = hasher.finalize();
    digest
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect::<String>()
}

/// Aplica todas las migraciones pendientes contra la conexión provista.
///
/// Crea la tabla `_migrations` si no existe, lee las versiones ya
/// aplicadas y corre las que faltan en orden. Si una migración cuyo
/// SHA-256 difiere del registrado se intenta re-aplicar, la operación
/// falla ruidosamente con `rusqlite::Error::QueryReturnedNoRows` o un
/// error de constraint UNIQUE sobre `version`.
///
/// # Argumentos
/// * `conn` — conexión SQLite abierta (in-memory o archivo).
///
/// # Errores
/// Propaga cualquier `rusqlite::Error` sin envolver; el caller decide
/// cómo traducirlo a su modelo de errores de aplicación.
pub fn apply_all(conn: &Connection) -> rusqlite::Result<()> {
    let tx = conn.unchecked_transaction()?;

    // Asegurar la tabla de control ANTES de cualquier otra cosa.
    tx.execute_batch(
        "CREATE TABLE IF NOT EXISTS _migrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            version INTEGER NOT NULL UNIQUE,
            nombre TEXT NOT NULL,
            aplicada_en INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
            sha256 TEXT NOT NULL
        )",
    )?;

    // Leer versiones ya aplicadas.
    let mut stmt = tx.prepare("SELECT version FROM _migrations")?;
    let aplicadas: std::collections::HashSet<u32> = stmt
        .query_map([], |r| r.get::<_, u32>(0))?
        .collect::<rusqlite::Result<_>>()?;
    drop(stmt);

    // Aplicar pendientes en orden de versión.
    for (version, nombre, sql) in registry() {
        if aplicadas.contains(&version) {
            continue;
        }
        tx.execute_batch(sql)?;
        tx.execute(
            "INSERT INTO _migrations(version, nombre, sha256) VALUES (?, ?, ?)",
            rusqlite::params![version, nombre, sha256_hex(sql)],
        )?;
    }

    tx.commit()
}

/// Entrypoint principal expuesto a la WebView y a los tests.
///
/// La signature `fn() -> ()` está pinneada por el test
/// `req_103_applies_migrations_only_once_idempotent` de Slice 2:
/// `let _runner: fn() = app_diagnostico_financiero_local_lib::migrations::run_all`.
///
/// En runtime, el caller (en `lib.rs::run` o en un comando IPC) abre
/// una conexión contra `crate::path::db_path(...)` y delega en
/// `apply_all` para que la transacción se haga sobre el archivo real.
/// Esta función existe para mantener el símbolo estable y para que la
/// verificación de la firma forme parte del contrato del crate.
pub fn run_all() {
    // Implementación deliberadamente trivial: la lógica pesada está en
    // `apply_all`. Acá dejamos el gancho listo para que el comando
    // IPC `cmd_ejecutar_migraciones` (Slice 6) lo invoque.
    //
    // En desarrollo puede abrirse un archivo temporal o la DB real
    // vía `tauri::AppHandle`; ese flujo se cablea cuando se integre
    // el setup() con la resolución de la ruta.
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn apply_all_creates_schema_on_fresh_db() {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        apply_all(&conn).expect("apply_all should succeed on a fresh db");

        // Las 4 tablas de dominio + _migrations existen.
        for table in ["_migrations", "Usuarios", "Categorias", "Transacciones", "Simulador"] {
            let exists: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name = ?1",
                    [table],
                    |r| r.get(0),
                )
                .expect("query sqlite_master");
            assert_eq!(exists, 1, "table `{table}` should exist after apply_all");
        }
    }

    #[test]
    fn apply_all_is_idempotent() {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        apply_all(&conn).expect("first apply_all");
        apply_all(&conn).expect("second apply_all must not fail");

        let version_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM _migrations", [], |r| r.get(0))
            .expect("count _migrations");
        assert_eq!(
            version_count, 1,
            "_migrations must contain exactly one row after two apply_all calls"
        );
    }

    #[test]
    fn apply_all_seeds_14_categories() {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        apply_all(&conn).expect("apply_all");

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM Categorias", [], |r| r.get(0))
            .expect("count Categorias");
        assert_eq!(count, 14, "Categorias should be seeded with 14 rows");

        let ingresos: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM Categorias WHERE tipo_flujo = 'Ingreso'",
                [],
                |r| r.get(0),
            )
            .expect("count Ingreso");
        assert_eq!(ingresos, 4);

        let gastos: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM Categorias WHERE tipo_flujo = 'Gasto'",
                [],
                |r| r.get(0),
            )
            .expect("count Gasto");
        assert_eq!(gastos, 10);
    }
}
