//! Tests for REQ-104: `tauri-plugin-sql` integration with the `sqlite` feature.
//!
//! Spec:    `openspec/changes/mvp-financiero-local-first/spec.md` §REQ-102 + §REQ-104
//! Design:  `openspec/changes/mvp-financiera-v1/design.md` §6 (Rust layer)
//! Task:    T-105 (integrate SQLite plugin)
//! Test #:  slice 2 / test #2
//!
//! RED PHASE: this file references
//! `app_diagnostico_financiero_local_lib::plugin`, which is NOT declared
//! in `lib.rs` yet. The IMPL phase will introduce a thin module that
//! wraps `tauri_plugin_sql::Builder` and is exposed through `lib.rs`
//! (e.g. `pub mod plugin;` at the top level, or `pub mod db; pub use
//! db::plugin;`). Until then, `cargo test --no-run` MUST fail to compile.

mod common;

/// REQ-104 / Scenario: Cargo.toml declares the `sqlite` feature for
/// `tauri-plugin-sql`. This is what enables the embedded SQLite engine
/// at build time. The feature is already declared today; this test
/// guards against accidental removal.
#[test]
fn req_104_cargo_toml_declares_sqlite_feature_for_tauri_plugin_sql() {
    let cargo_toml = common::read_text(&common::cargo_toml_path());

    assert!(
        cargo_toml.contains("tauri-plugin-sql"),
        "REQ-104: Cargo.toml must depend on `tauri-plugin-sql`",
    );
    assert!(
        cargo_toml.contains("features") && cargo_toml.contains("sqlite"),
        "REQ-104: `tauri-plugin-sql` must be declared with the `sqlite` feature",
    );
}

/// REQ-104 / Scenario: `capabilities/default.json` allows the three SQL
/// operations the WebView needs (`sql:default`, `sql:allow-execute`,
/// `sql:allow-select`). The plugin module the IMPL phase exposes will
/// be registered as a Tauri plugin via `.plugin(tauri_plugin_sql::Builder::default().build())`
/// (already wired in `lib.rs`), but the *capability* granting the WebView
/// permission to call into it lives in `capabilities/default.json`.
#[test]
fn req_104_capabilities_default_json_allows_sql_default_sql_allow_execute_sql_allow_select() {
    // First, the structural assertions on the capability file. Today
    // `capabilities/default.json` only declares `core:default` — so this
    // assertion FAILS (RED), exactly as expected.
    let caps_path = common::capabilities_default_path();
    let raw = common::read_text(&caps_path);
    let parsed: serde_json::Value = serde_json::from_str(&raw)
        .unwrap_or_else(|e| panic!("REQ-104: capabilities/default.json must be valid JSON: {e}"));

    let permissions = parsed
        .get("permissions")
        .and_then(|p| p.as_array())
        .unwrap_or_else(|| panic!("REQ-104: capabilities/default.json must have a `permissions` array"));

    let has = |needle: &str| -> bool {
        permissions
            .iter()
            .any(|v| v.as_str().map(|s| s == needle).unwrap_or(false))
    };

    assert!(
        has("sql:default"),
        "REQ-104: capabilities/default.json must allow `sql:default` (found permissions: {:?})",
        permissions,
    );
    assert!(
        has("sql:allow-execute"),
        "REQ-104: capabilities/default.json must allow `sql:allow-execute`",
    );
    assert!(
        has("sql:allow-select"),
        "REQ-104: capabilities/default.json must allow `sql:allow-select`",
    );

    // Second, the plugin module wiring. The IMPL phase must expose the
    // plugin builder through a stable crate path so the rest of the app
    // can compose it. Today the module does not exist → compile error.
    fn _plugin_reexported() {
        // Taking the module as a use-statement forces the compiler to
        // resolve the path. The IMPL phase will provide a module that
        // re-exports `tauri_plugin_sql` plus a thin wrapper.
        let _ = app_diagnostico_financiero_local_lib::plugin::BUILDER;
    }
    _plugin_reexported();
}

/// REQ-104 / Scenario: the DB path is the canonical `misfinanzas.db` inside
/// the app's data directory (`BaseDirectory::App`). Today the path module
/// is not declared, so the symbol resolution fails (RED).
#[test]
fn req_104_db_path_is_base_directory_app_misfinanzas_db() {
    // The IMPL phase must expose `path::db_path(base: &Path) -> PathBuf`
    // (or an equivalent that resolves to `BaseDirectory::App/misfinanzas.db`
    // at runtime — design §6.4 `ruta_db`).
    //
    // We assert the symbol exists; the behavioural assertions live in
    // `db_path_test.rs` (REQ-106).
    let _symbol: fn(&std::path::Path) -> std::path::PathBuf =
        app_diagnostico_financiero_local_lib::path::db_path;
}