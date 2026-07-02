//! Wrapper del plugin SQL de Tauri.
//!
//! Decisión de producto: la WebView accede a la DB SOLO a través de
//! `tauri-plugin-sql` con la feature `sqlite` habilitada (ver
//! `design.md` §6 — "Capacidades mínimas" + §2 topología). Este módulo
//! expone un punto único para construir el builder y una constante
//! `BUILDER` que la suite de tests usa para garantizar que el plugin
//! sigue integrado.
//!
//! Las capabilities que autorizan al WebView a invocar el plugin viven
//! en `capabilities/default.json` y se verifican en los tests de
//! REQ-104/REQ-105.

use tauri_plugin_sql::{Builder as SqlBuilder, Migration, MigrationKind};

/// Etiqueta lógica del plugin. Coincide con la primera parte de los
/// `sql:default`, `sql:allow-execute` y `sql:allow-select` que
/// `capabilities/default.json` declara.
pub const PLUGIN_NAME: &str = "sql";

/// Constructor del plugin. `BUILDER` se reexporta para que el código de
/// tests (`sql_plugin_test.rs`) pueda forzar la resolución del símbolo
/// sin tener que instanciar el builder completo (que requiere contexto
/// de Tauri).
///
/// Se mantiene como `fn() -> SqlBuilder` para ser un valor de función
/// puro: cero efectos al referenciarlo, lo que es ideal para
/// compile-grep tests de tipo TDD.
pub const BUILDER: fn() -> SqlBuilder = || SqlBuilder::default();

/// Construye la lista de migraciones que `tauri-plugin-sql` debe aplicar
/// en el arranque. La fuente de verdad sigue siendo el archivo
/// `migrations/001_inicial.sql` (incluido también desde
/// `crate::migrations::run_all`); acá lo duplicamos a través del API
/// tipado del plugin para mantener compatibilidad con su `add_migrations`.
///
/// # Notas
/// * `include_str!` se evalúa en tiempo de compilación; cualquier error
///   en la ruta del archivo falla el build, no el runtime.
pub fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 1,
        description: "schema_inicial_v1",
        sql: include_str!("../migrations/001_inicial.sql"),
        kind: MigrationKind::Up,
    }]
}
