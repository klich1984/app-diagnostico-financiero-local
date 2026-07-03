// MVP Financiero Local-First — librería del binario Tauri v2.
//
// Esta capa es delgada: su responsabilidad es montar el runtime de Tauri,
// registrar plugins (SQL) y exponer comandos IPC. La lógica de negocio
// vive en `src/domain/` (TypeScript) y la persistencia en los módulos
// Rust de este crate (`path`, `plugin`, `migrations`, `seeds`).

pub mod migrations;
pub mod path;
pub mod plugin;
pub mod seeds;
pub mod transacciones;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .setup(|_app| Ok(()))
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
