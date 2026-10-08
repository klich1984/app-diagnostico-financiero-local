//! Módulo de respaldo y restauración de la base de datos SQLite.
//!
//! Utiliza la API nativa de Online Backup de SQLite (`rusqlite::backup::Backup`)
//! para garantizar consistencia atómica sin riesgos de corrupción ni bloqueos.

use rusqlite::Connection;
use std::path::Path;

/// Tablas requeridas que deben existir en cualquier archivo de respaldo válido.
pub const REQUIRED_TABLES: &[&str] = &["Usuarios", "Categorias", "Transacciones", "_migrations"];

/// Exporta el estado actual de la conexión SQLite hacia un archivo en `destino`.
///
/// Abre una conexión temporal contra el archivo destino y transfiere las páginas
/// usando el online backup API de SQLite.
pub fn exportar_backup_impl(conn: &Connection, destino: &Path) -> Result<(), String> {
    if let Some(parent) = destino.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("creando directorio destino: {e}"))?;
    }

    let mut dst_conn = Connection::open(destino)
        .map_err(|e| format!("abriendo archivo de backup destino {}: {e}", destino.display()))?;

    let backup = rusqlite::backup::Backup::new(conn, &mut dst_conn)
        .map_err(|e| format!("iniciando backup: {e}"))?;

    backup
        .run_to_completion(5, std::time::Duration::from_millis(250), None)
        .map_err(|e| format!("ejecutando backup: {e}"))?;

    Ok(())
}

/// Valida que un archivo sea una base de datos SQLite válida y contenga
/// las tablas obligatorias del esquema de la aplicación.
pub fn validar_archivo_backup(ruta: &Path) -> Result<(), String> {
    if !ruta.exists() {
        return Err(format!("El archivo no existe: {}", ruta.display()));
    }

    let conn = Connection::open_with_flags(
        ruta,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|e| format!("El archivo de respaldo es inválido o no es SQLite: {e}"))?;

    // 1. Correr integrity_check
    let integrity: String = conn
        .query_row("PRAGMA integrity_check;", [], |r| r.get(0))
        .map_err(|e| format!("fallo al verificar integridad: {e}"))?;

    if integrity != "ok" {
        return Err(format!("Integridad de base de datos comprometida: {integrity}"));
    }

    // 2. Verificar tablas obligatorias
    for tabla in REQUIRED_TABLES {
        let existe: bool = conn
            .query_row(
                "SELECT count(*) > 0 FROM sqlite_master WHERE type='table' AND name=?1",
                [tabla],
                |r| r.get(0),
            )
            .map_err(|e| format!("consultando tabla {tabla}: {e}"))?;

        if !existe {
            return Err(format!("El respaldo no contiene la tabla requerida '{tabla}'"));
        }
    }

    Ok(())
}

/// Restaura una base de datos desde `origen_backup` hacia `db_activa`.
///
/// Valida primero el archivo fuente y luego utiliza el SQLite Backup API
/// para transferir las páginas limpiamente hacia la base activa.
pub fn restaurar_backup_impl(origen_backup: &Path, db_activa: &Path) -> Result<(), String> {
    validar_archivo_backup(origen_backup)?;

    if let Some(parent) = db_activa.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("creando directorio de base activa: {e}"))?;
    }

    let src_conn = Connection::open_with_flags(
        origen_backup,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
    )
    .map_err(|e| format!("abriendo respaldo origen: {e}"))?;

    let mut dst_conn = Connection::open(db_activa)
        .map_err(|e| format!("abriendo base activa destino: {e}"))?;

    {
        let backup = rusqlite::backup::Backup::new(&src_conn, &mut dst_conn)
            .map_err(|e| format!("iniciando restauración de backup: {e}"))?;

        backup
            .run_to_completion(5, std::time::Duration::from_millis(250), None)
            .map_err(|e| format!("ejecutando restauración: {e}"))?;
    }

    // Asegurar foreign keys y migraciones en la base destino
    dst_conn
        .execute_batch("PRAGMA foreign_keys = ON;")
        .map_err(|e| format!("activando foreign keys post-restauración: {e}"))?;

    crate::migrations::apply_all(&dst_conn)
        .map_err(|e| format!("aplicando migraciones pendientes tras restaurar: {e}"))?;

    Ok(())
}
