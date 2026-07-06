//! Helpers de apertura de la conexión SQLite contra `BaseDirectory::App`.
//!
//! Ver `design.md` §6.4 (capa persistencia) y `slice-7-test-plan.md`.
//! Este módulo es la ÚNICA capa del backend que:
//!   1. Resuelve el directorio de datos de la app vía el API de Tauri
//!      (`AppHandle::path().app_data_dir()`).
//!   2. Crea ese directorio si no existe (`std::fs::create_dir_all`).
//!   3. Construye la ruta del archivo de DB combinando `crate::path::db_path`
//!      con el directorio resuelto.
//!   4. Abre un `rusqlite::Connection` contra esa ruta.
//!   5. Corre `crate::migrations::apply_all` para asegurar que el schema
//!      está al día.
//!
//! Mantenemos dos variantes para hacer testeable el flujo sin Tauri:
//!   * `abrir_conexion(&AppHandle)` — entrypoint de producción, invocado
//!     por cada comando IPC.
//!   * `abrir_conexion_en_path(&Path)` — entrypoint usado por la suite
//!     de tests de integración: toma una ruta arbitraria (normalmente un
//!     `tempfile::tempdir()`) y aplica exactamente los mismos pasos de
//!     filesystem + migrations.
//!
//! Separar la dependencia de `AppHandle` en su propia función nos permite
//! cubrir la creación de la DB en disco con tests deterministas, sin
//! necesitar levantar el runtime de Tauri.
//!
//! ## Contrato observable desde tests (slice 7)
//!   * La DB existe en disco después de llamar a `abrir_conexion_en_path`.
//!   * Las 4 tablas de dominio + `_migrations` están creadas.
//!   * Las 14 categorías semilla están presentes.
//!   * El runner es idempotente: aplicarlo dos veces no rompe nada.

use rusqlite::Connection;
use std::path::{Path, PathBuf};

// `tauri::Manager` provee `AppHandle::path()` (PathResolver) que se usa
// para resolver `BaseDirectory::App` → `app_data_dir()`. Necesita estar
// en scope explícitamente (Rust 2021 edition no lo preludia).
use tauri::Manager;

use crate::migrations;
use crate::path;

/// Abre una conexión contra la DB de producción
/// (`BaseDirectory::App/misfinanzas.db`) y le aplica las migraciones.
///
/// `AppHandle::path().app_data_dir()` devuelve, en Windows,
/// `C:\Users\<user>\AppData\Roaming\<bundle.identifier>\`. El bundle id
/// del MVP es `com.hetan.mvp-financiero`, así que la DB termina en
/// `C:\Users\hetan\AppData\Roaming\com.hetan.mvp-financiero\misfinanzas.db`
/// después de la primera invocación de un comando IPC.
///
/// # Errores
/// Cualquier fallo (resolución de la ruta, `create_dir_all`, apertura
/// del archivo, aplicacion de migraciones) se devuelve como
/// `String` legible para que el wrapper `#[tauri::command]` lo propague
/// como `Err(String)` al frontend sin envolver.
pub fn abrir_conexion(app: &tauri::AppHandle) -> Result<Connection, String> {
    let dir: PathBuf = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("resolving app_data_dir: {e}"))?;

    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("creating app data dir {}: {e}", dir.display()))?;

    let db_path: PathBuf = path::db_path(&dir);
    abrir_conexion_en_path(&db_path)
}

/// Variante testeable que NO depende del runtime de Tauri.
///
/// Acepta una ruta arbitraria al archivo de DB. Crea el directorio
/// padre si no existe, abre la conexión y aplica las migraciones.
///
/// Usada por los tests de integración (`commands_test.rs` y la nueva
/// suite `db_test.rs` que se agregue) para verificar que la DB aparece
/// físicamente en disco y queda lista para recibir queries.
///
/// # Argumentos
/// * `db_file` — ruta completa al archivo `.db` (incluyendo extensión).
///
/// # Errores
/// Devuelve `String` con contexto suficiente para que el assert de test
/// pinte el motivo exacto del fallo.
pub fn abrir_conexion_en_path(db_file: &Path) -> Result<Connection, String> {
    if let Some(parent) = db_file.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("creating db parent dir {}: {e}", parent.display()))?;
    }

    let conn = Connection::open(db_file)
        .map_err(|e| format!("opening db at {}: {e}", db_file.display()))?;

    migrations::apply_all(&conn).map_err(|e| format!("applying migrations: {e}"))?;

    Ok(conn)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Spec: la DB aparece físicamente en disco después de
    /// `abrir_conexion_en_path` y las 4 tablas de dominio están
    /// presentes.
    #[test]
    fn abrir_conexion_en_path_creates_db_file_with_schema() {
        let dir = tempfile::tempdir().expect("create tempdir");
        let db_file = dir.path().join("misfinanzas.db");

        assert!(!db_file.exists(), "precondition: db file should not exist");

        let conn =
            abrir_conexion_en_path(&db_file).expect("abrir_conexion_en_path should succeed");

        assert!(
            db_file.exists(),
            "abrir_conexion_en_path must create the db file on disk"
        );

        for table in ["_migrations", "Usuarios", "Categorias", "Transacciones", "Simulador"] {
            let exists: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name = ?1",
                    [table],
                    |r| r.get(0),
                )
                .expect("query sqlite_master");
            assert_eq!(
                exists, 1,
                "table `{table}` must exist after abrir_conexion_en_path"
            );
        }
    }

    /// Spec: el runner es idempotente — llamarlo dos veces con la
    /// MISMA ruta no duplica filas en `_migrations` ni rompe la DB.
    #[test]
    fn abrir_conexion_en_path_is_idempotent() {
        let dir = tempfile::tempdir().expect("create tempdir");
        let db_file = dir.path().join("misfinanzas.db");

        let _first = abrir_conexion_en_path(&db_file).expect("first open");
        let conn = abrir_conexion_en_path(&db_file).expect("second open must not fail");

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM _migrations", [], |r| r.get(0))
            .expect("count _migrations");
        assert_eq!(
            count, 1,
            "abrir_conexion_en_path must NOT duplicate _migrations rows"
        );
    }

    /// Spec: las 14 categorias semilla (4 Ingreso + 10 Gasto) están
    /// presentes después de `abrir_conexion_en_path`, sin necesidad de
    /// correr migraciones por separado.
    #[test]
    fn abrir_conexion_en_path_seeds_14_categorias() {
        let dir = tempfile::tempdir().expect("create tempdir");
        let db_file = dir.path().join("misfinanzas.db");

        let conn = abrir_conexion_en_path(&db_file).expect("open");

        let total: i64 = conn
            .query_row("SELECT COUNT(*) FROM Categorias", [], |r| r.get(0))
            .expect("count Categorias");
        assert_eq!(total, 14, "abrir_conexion_en_path must seed 14 categorias");

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

    /// Spec: `abrir_conexion_en_path` debe crear el directorio padre
    /// si la ruta apunta a un directorio que aún no existe.
    #[test]
    fn abrir_conexion_en_path_creates_missing_parent_dirs() {
        let dir = tempfile::tempdir().expect("create tempdir");
        let nested = dir.path().join("deep").join("nested").join("misfinanzas.db");

        assert!(!nested.parent().unwrap().exists(), "precondition: parent dir missing");

        let _conn = abrir_conexion_en_path(&nested).expect("open with nested parent");

        assert!(
            nested.exists(),
            "abrir_conexion_en_path must create parent dirs and the db file"
        );
    }
}
