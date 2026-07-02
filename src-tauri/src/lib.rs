// MVP Financiero Local-First — librería del binario Tauri v2.
// Por ahora sólo arranca la app. Los comandos IPC y la integración
// con tauri-plugin-sql se agregan en slices posteriores (Épica 1 / Slice 2).

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