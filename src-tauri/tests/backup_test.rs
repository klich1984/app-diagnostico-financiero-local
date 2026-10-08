use app_diagnostico_financiero_local_lib::backup::{
    exportar_backup_impl, restaurar_backup_impl, validar_archivo_backup,
};
use app_diagnostico_financiero_local_lib::db::abrir_conexion_en_path;
use app_diagnostico_financiero_local_lib::transacciones::repo::{self, TransaccionInput};
use std::fs::File;
use std::io::Write;
use tempfile::tempdir;

#[test]
fn test_exportar_backup_creates_valid_sqlite_copy() {
    let dir = tempdir().unwrap();
    let db_path = dir.path().join("misfinanzas.db");
    let backup_path = dir.path().join("backup.db");

    // Abrir DB y sembrar una transacción
    let conn = abrir_conexion_en_path(&db_path).unwrap();
    let mut stmt = conn.prepare("SELECT id FROM Usuarios WHERE nombre = 'Yo'").unwrap();
    let user_id: i64 = stmt.query_row([], |r| r.get(0)).unwrap();

    let input = TransaccionInput {
        usuario_id: Some(user_id),
        tipo_flujo: "Ingreso".into(),
        categoria_id: 1,
        concepto: "Salario Test".into(),
        frecuencia: "Mensual".into(),
        comportamiento: None,
        naturaleza_necesidad: None,
        valor_centavos: 500_000_00,
    };
    repo::insert(&conn, &input).unwrap();

    // Exportar backup
    exportar_backup_impl(&conn, &backup_path).unwrap();

    // Verificar que el archivo de backup existe y contiene los datos
    assert!(backup_path.exists());
    validar_archivo_backup(&backup_path).unwrap();

    let backup_conn = rusqlite::Connection::open(&backup_path).unwrap();
    let count: i64 = backup_conn
        .query_row(
            "SELECT count(*) FROM Transacciones WHERE concepto = 'Salario Test'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(count, 1);
}

#[test]
fn test_validar_archivo_backup_rejects_corrupted_or_non_sqlite() {
    let dir = tempdir().unwrap();
    let corrupt_path = dir.path().join("corrupt.db");

    let mut file = File::create(&corrupt_path).unwrap();
    file.write_all(b"NOT A SQLITE FILE AT ALL").unwrap();

    let err = validar_archivo_backup(&corrupt_path);
    assert!(err.is_err());
    let err_msg = err.unwrap_err();
    assert!(
        err_msg.to_lowercase().contains("inválido")
            || err_msg.to_lowercase().contains("sqlite")
            || err_msg.to_lowercase().contains("database disk image is malformed")
            || err_msg.to_lowercase().contains("file is not a database")
            || err_msg.to_lowercase().contains("comprometida")
    );
}

#[test]
fn test_validar_archivo_backup_rejects_sqlite_without_required_tables() {
    let dir = tempdir().unwrap();
    let empty_db_path = dir.path().join("empty.db");

    let conn = rusqlite::Connection::open(&empty_db_path).unwrap();
    conn.execute_batch("CREATE TABLE Dummy (id INTEGER PRIMARY KEY);").unwrap();

    let err = validar_archivo_backup(&empty_db_path);
    assert!(err.is_err());
    assert!(err.unwrap_err().contains("tabla requerida"));
}

#[test]
fn test_restaurar_backup_replaces_database_successfully() {
    let dir = tempdir().unwrap();
    let active_db_path = dir.path().join("misfinanzas.db");
    let backup_path = dir.path().join("backup.db");

    // 1. Crear backup con datos
    {
        let conn = abrir_conexion_en_path(&backup_path).unwrap();
        let mut stmt = conn.prepare("SELECT id FROM Usuarios WHERE nombre = 'Yo'").unwrap();
        let user_id: i64 = stmt.query_row([], |r| r.get(0)).unwrap();

        let input = TransaccionInput {
            usuario_id: Some(user_id),
            tipo_flujo: "Gasto".into(),
            categoria_id: 5,
            concepto: "Gasto en Backup".into(),
            frecuencia: "Mensual".into(),
            comportamiento: Some("Fijo".into()),
            naturaleza_necesidad: Some("Necesario".into()),
            valor_centavos: 120_000_00,
        };
        repo::insert(&conn, &input).unwrap();
    }

    // 2. Crear active DB con otros datos
    {
        let conn = abrir_conexion_en_path(&active_db_path).unwrap();
        let mut stmt = conn.prepare("SELECT id FROM Usuarios WHERE nombre = 'Yo'").unwrap();
        let user_id: i64 = stmt.query_row([], |r| r.get(0)).unwrap();

        let input = TransaccionInput {
            usuario_id: Some(user_id),
            tipo_flujo: "Gasto".into(),
            categoria_id: 5,
            concepto: "Gasto Local Antes de Restore".into(),
            frecuencia: "Mensual".into(),
            comportamiento: Some("Fijo".into()),
            naturaleza_necesidad: Some("Necesario".into()),
            valor_centavos: 50_000_00,
        };
        repo::insert(&conn, &input).unwrap();
    }

    // 3. Restaurar backup sobre active_db
    restaurar_backup_impl(&backup_path, &active_db_path).unwrap();

    // 4. Verificar que active_db ahora tiene los datos del backup
    let conn = abrir_conexion_en_path(&active_db_path).unwrap();
    let count_backup: i64 = conn
        .query_row(
            "SELECT count(*) FROM Transacciones WHERE concepto = 'Gasto en Backup'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(count_backup, 1);

    let count_old: i64 = conn
        .query_row(
            "SELECT count(*) FROM Transacciones WHERE concepto = 'Gasto Local Antes de Restore'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(count_old, 0);
}
