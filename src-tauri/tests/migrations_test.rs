//! Tests for REQ-103: versioned migrations and initial schema.
//!
//! Spec:    `openspec/changes/mvp-financiero-local-first/spec.md` §REQ-103
//! Design:  `openspec/changes/mvp-financiero-local-first/design.md` §5 (DDL),
//!          §6.6 (migration runner), §11 (migrations registry)
//! Task:    T-104 (migrations registry + 001_inicial.sql)
//! Test #:  slice 2 / test #1
//!
//! RED PHASE: this file references the crate symbols
//! `app_diagnostico_financiero_local_lib::migrations::run_all`,
//! which do NOT exist in `lib.rs` yet. `cargo test --no-run` MUST fail
//! to compile because of the unresolved imports. That is the expected
//! RED state. The IMPL phase will introduce the module under whatever
//! path the user picks (design §6.1 suggests `db::migrations`, the
//! user's prompt example uses the top-level `crate::migrations` — both
//! will resolve these imports once `lib.rs` declares the module).
//!
//! Why we test the SQL file's contents (not a live connection): `rusqlite`
//! is not a declared dependency of this crate in RED. Adding it is an
//! IMPL-phase change. So the structural properties of the schema (table
//! set, column types, CHECK constraints) are asserted against the committed
//! SQL file, while behavioural properties (idempotency, version recording)
//! are guarded by type-level signatures that fail to compile until the
//! IMPL phase lands.

mod common;

/// REQ-103 / Scenario: "Creación de tablas con esquema correcto".
///
/// Given: a fresh database and the migrations registry loaded.
/// When:  the app boots for the first time.
/// Then:  the 4 domain tables (`Usuarios`, `Categorias`, `Transacciones`,
///        `Simulador`) plus the internal `_migrations` control table exist.
#[test]
fn req_103_creates_all_four_tables_on_first_run() {
    let sql = common::read_text(&common::sql_initial_migration_path());

    for required in [
        "_migrations",
        "Usuarios",
        "Categorias",
        "Transacciones",
        "Simulador",
    ] {
        assert!(
            sql.contains(required),
            "REQ-103: migrations/001_inicial.sql must declare `{required}` (missing)",
        );
    }

    // Distinct CREATE TABLE statements: 4 domain + _migrations = 5 minimum.
    let create_table_count = sql.matches("CREATE TABLE").count();
    assert!(
        create_table_count >= 5,
        "REQ-103: expected at least 5 CREATE TABLE statements \
         (4 domain + _migrations), found {create_table_count}",
    );
}

/// REQ-103 / Scenario: "las columnas monetarias usan tipo INTEGER para
/// almacenar centavos". The design specifies that `valor_centavos`,
/// `salario_personal_objetivo_centavos` and `nuevo_valor_mensual_centavos`
/// are always INTEGER to preserve cent precision across the pipeline.
#[test]
fn req_103_transacciones_table_has_integer_columns_for_monetary_amounts() {
    let sql = common::read_text(&common::sql_initial_migration_path());

    assert!(
        sql.contains("valor_centavos INTEGER"),
        "REQ-103: Transacciones.valor_centavos must be INTEGER for cent precision",
    );
    assert!(
        sql.contains("salario_personal_objetivo_centavos INTEGER"),
        "REQ-103: Usuarios.salario_personal_objetivo_centavos must be INTEGER",
    );
    assert!(
        sql.contains("nuevo_valor_mensual_centavos INTEGER"),
        "REQ-103: Simulador.nuevo_valor_mensual_centavos must be INTEGER",
    );
}

/// REQ-103 / Scenario: applying migrations twice must succeed and must not
/// duplicate the version row. Classic idempotency requirement for any
/// migration runner. This test pins the runner symbol so the IMPL phase
/// must expose it under a stable path.
#[test]
fn req_103_applies_migrations_only_once_idempotent() {
    // The IMPL phase must expose the migration runner at this exact path
    // (the canonical entrypoint described in design §6.6):
    //
    //     app_diagnostico_financiero_local_lib::migrations::run_all
    //
    // Taking the fn-item as a value forces the compiler to resolve the
    // path. In RED the path is unresolved (no `migrations` module in
    // `lib.rs`), so this test fails to compile. In GREEN the path resolves
    // and the IMPL phase replaces this assertion with a live two-call
    // exercise against an in-memory SQLite connection.
    let _runner: fn() = app_diagnostico_financiero_local_lib::migrations::run_all;
}

/// REQ-103 / Scenario: every applied migration must be recorded in the
/// `_migrations` table with its version, name and SHA-256 hash (design
/// §6.6 last paragraph — drift detection).
#[test]
fn req_103_migration_version_is_recorded_in_the_migrations_table() {
    let sql = common::read_text(&common::sql_initial_migration_path());

    assert!(
        sql.contains("version INTEGER"),
        "REQ-103: _migrations table must store `version INTEGER`",
    );
    assert!(
        sql.contains("nombre TEXT"),
        "REQ-103: _migrations table must store `nombre TEXT` \
         (human-readable migration id)",
    );
    assert!(
        sql.contains("sha256 TEXT"),
        "REQ-103: _migrations table must store `sha256 TEXT` to detect drift \
         (design §6.6)",
    );
}
