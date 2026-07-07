// MVP Financiero Local-First — librería del binario Tauri v2.
//
// Esta capa es delgada: su responsabilidad es montar el runtime de Tauri,
// registrar plugins (SQL) y exponer comandos IPC. La lógica de negocio
// vive en `src/domain/` (TypeScript) y la persistencia en los módulos
// Rust de este crate (`db`, `path`, `plugin`, `migrations`, `seeds`, y
// los repositorios `transacciones/`, `simulador/`).

pub mod commands;
pub mod db;
pub mod kpis;
pub mod migrations;
pub mod path;
pub mod plugin;
pub mod seeds;
pub mod simulador;
pub mod transacciones;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .setup(|_app| Ok(()))
        .invoke_handler(tauri::generate_handler![
            commands::cmd_obtener_categorias,
            commands::cmd_insert_transaccion,
            commands::cmd_listar_transacciones,
            commands::cmd_eliminar_transaccion,
        ])
        .run(tauri::generate_context!())
        .expect("error al iniciar MVP Financiero");
}

#[cfg(test)]
mod tests {
    #[test]
    fn smoke() {
        assert_eq!(2 + 2, 4);
    }
}
