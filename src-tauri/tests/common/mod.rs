//! Shared helpers for the Slice 2 integration test suite.
//!
//! Convention: each `tests/*.rs` file is compiled as its own crate by Cargo.
//! Code that more than one test file needs lives here. Cargo treats files
//! in a `common/` subdirectory as a regular module (not a test target),
//! so we expose functions only through `pub` items below.
//!
//! These helpers do NOT touch the implementation modules. They only give
//! us stable paths to the source files we need to inspect from disk so
//! the tests can be expressed before the IMPL phase lands.

use std::path::{Path, PathBuf};

/// Returns the path to `src-tauri/` from the perspective of a test running
/// inside `src-tauri/`. Cargo runs tests with `CARGO_MANIFEST_DIR` set to
/// the package root (`src-tauri/`), so we use that as the anchor.
pub fn src_tauri_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

/// Path to `migrations/001_inicial.sql` (the canonical migration file
/// described in design.md §5.6). The IMPL phase is expected to `include_str!`
/// this file from `src-tauri/src/db/migrations.rs`.
pub fn sql_initial_migration_path() -> PathBuf {
    src_tauri_root().join("migrations").join("001_inicial.sql")
}

/// Path to `Cargo.toml`. Used by the SQL plugin test to assert that
/// `tauri-plugin-sql` is declared with the `sqlite` feature.
pub fn cargo_toml_path() -> PathBuf {
    src_tauri_root().join("Cargo.toml")
}

/// Path to the capabilities file that grants permissions to the main window.
/// The IMPL phase is expected to declare `sql:default`, `sql:allow-execute`
/// and `sql:allow-select` here.
pub fn capabilities_default_path() -> PathBuf {
    src_tauri_root().join("capabilities").join("default.json")
}

/// Reads a UTF-8 text file and returns its contents, panicking with a
/// descriptive message if the file is missing. Useful for failing tests
/// with actionable diagnostics instead of opaque `unwrap` errors.
pub fn read_text(path: &Path) -> String {
    std::fs::read_to_string(path).unwrap_or_else(|err| {
        panic!(
            "expected file at {} but could not read it: {}",
            path.display(),
            err
        )
    })
}