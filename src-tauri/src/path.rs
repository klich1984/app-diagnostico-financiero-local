//! Resolución de la ruta de la base de datos local.
//!
//! La DB vive en `BaseDirectory::App/misfinanzas.db` (ver `design.md` §6.4).
//! Este módulo expone una función pura (`db_path`) que toma un directorio
//! base y devuelve la ruta absoluta del archivo. Mantenerla pura nos permite
//! probarla sin instanciar el runtime de Tauri: la integración con Tauri
//! se hace en otra capa que resuelve `BaseDirectory::App` y luego invoca
//! `db_path`.
//!
//! Contrato observable desde los tests de Slice 2 (`db_path_test.rs`):
//!   * la ruta devuelta está dentro del directorio base
//!   * el nombre de archivo es exactamente `misfinanzas.db`
//!   * la función es determinista (mismo input → mismo output)

use std::path::{Path, PathBuf};

/// Nombre canónico del archivo de base de datos. Hardcodeado por decisión
/// de producto (design §1 — "Capa Persistencia" — y §6.4).
pub const DB_FILENAME: &str = "misfinanzas.db";

/// Devuelve la ruta del archivo de DB dentro del `base_dir` provisto.
///
/// Esta función NO toca el sistema de archivos: es pura y por eso
/// deterministic. La creación del directorio (cuando no existe) se hace
/// en otra capa del backend antes de abrir el pool de conexiones.
///
/// # Argumentos
/// * `base_dir` — directorio de datos de la app resuelto por el caller
///                (en producción viene de `tauri::path::BaseDirectory::App`).
pub fn db_path(base_dir: &Path) -> PathBuf {
    base_dir.join(DB_FILENAME)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn db_path_appends_filename() {
        let base = Path::new("/tmp/app");
        let resolved = db_path(base);
        assert_eq!(resolved, PathBuf::from("/tmp/app/misfinanzas.db"));
    }

    #[test]
    fn db_path_is_deterministic() {
        let base = Path::new("/var/lib/app");
        assert_eq!(db_path(base), db_path(base));
    }
}
