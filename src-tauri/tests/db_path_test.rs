//! Tests for REQ-106: DB path resolution.
//!
//! Spec:    `openspec/changes/mvp-financiero-local-first/spec.md` §REQ-102 +
//!          §REQ-106
//! Design:  `openspec/changes/mvp-financiero-local-first/design.md` §6.4
//!          (`ruta_db` — connection module)
//! Task:    T-106 (DB path resolution)
//! Test #:  slice 2 / test #4
//!
//! RED PHASE: all three tests in this file reference
//! `app_diagnostico_financiero_local_lib::path::db_path`, which is NOT
//! declared in `lib.rs` yet. `cargo test --no-run` MUST fail to compile.
//!
//! Signature contract pinned here so the IMPL phase has a stable target:
//!
//! ```ignore
//! pub fn db_path(base_dir: &Path) -> PathBuf
//! ```
//!
//! The IMPL phase can choose to live at the crate root or under `db::path`;
//! whichever it picks, the use-statements below must resolve. The
//! behavioural contract — input `&Path`, output a child path whose
//! suffix is `misfinanzas.db` and whose parent equals the input — is
//! independent of where the module lives.

use std::path::PathBuf;

/// REQ-106 / Scenario: the resolved DB path must live inside the app data
/// directory. We pass a temp directory as the `base_dir` so the test is
/// deterministic and has no dependency on the Tauri runtime.
#[test]
fn req_106_db_path_returns_a_path_inside_the_app_data_directory() {
    let base = tempdir_inside("req_106_inside");
    let resolved = app_diagnostico_financiero_local_lib::path::db_path(&base);
    assert!(
        resolved.starts_with(&base),
        "REQ-106: db_path({}) must return a path inside the base directory, got {}",
        base.display(),
        resolved.display(),
    );
}

/// REQ-106 / Scenario: the file name must be exactly `misfinanzas.db`.
/// Hardcoded product decision (design §1 — "Capa Persistencia" — and §6.4).
#[test]
fn req_106_db_path_suffix_is_misfinanzas_db() {
    let base = tempdir_inside("req_106_suffix");
    let resolved = app_diagnostico_financiero_local_lib::path::db_path(&base);
    assert_eq!(
        resolved.file_name().and_then(|n| n.to_str()),
        Some("misfinanzas.db"),
        "REQ-106: db_path() must end with `/misfinanzas.db`, got {}",
        resolved.display(),
    );
}

/// REQ-106 / Scenario: calling `db_path` twice with the same base must
/// return the same `PathBuf`. The function is pure; no time-, pid- or
/// uuid-based suffixes are allowed (they would defeat `BaseDirectory::App`'s
/// "one DB per install" guarantee).
#[test]
fn req_106_db_path_is_stable_across_calls() {
    let base = tempdir_inside("req_106_stable");
    let first = app_diagnostico_financiero_local_lib::path::db_path(&base);
    let second = app_diagnostico_financiero_local_lib::path::db_path(&base);
    assert_eq!(
        first, second,
        "REQ-106: db_path() must be deterministic across calls",
    );
}

// -- helpers --------------------------------------------------------------

/// Create a unique temporary directory under the OS temp dir and return
/// its path. We do NOT depend on the `tempfile` crate in RED (it's an
/// IMPL-phase dependency). `std::env::temp_dir()` + a unique subdir name
/// is sufficient for the IMPL phase to swap in a proper `tempfile::tempdir`
/// later if desired.
fn tempdir_inside(tag: &str) -> PathBuf {
    let mut dir = std::env::temp_dir();
    let unique = format!(
        "mpv-financiero-{tag}-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0),
    );
    dir.push(unique);
    std::fs::create_dir_all(&dir).expect("failed to create temp dir for REQ-106 test");
    dir
}