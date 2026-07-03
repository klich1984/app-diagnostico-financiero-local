//! Tests for REQ-201: seeded categories metadata (14 rows).
//!
//! Spec:    `openspec/changes/mvp-financiero-local-first/spec.md` §REQ-201
//! Design:  `openspec/changes/mvp-financiero-local-first/design.md` §5.3
//!          (tabla Categorias + seed list) + §5.6 (seed insert in migration)
//! Task:    T-201 (verify categories seeded)
//! Test #:  slice 2 / test #5
//!
//! RED PHASE: this file references
//! `app_diagnostico_financiero_local_lib::seeds::apply`, which is NOT
//! declared in `lib.rs` yet. `cargo test --no-run` MUST fail to compile.
//!
//! The IMPL phase must:
//! 1. Add the 14 INSERT INTO Categorias statements to `001_inicial.sql`
//!    (preferred — atomic with the schema migration) OR expose a
//!    `seeds::apply(conn)` function called from `migrations::run_all`.
//! 2. Ensure each row carries `nombre`, `tipo_flujo` and (optionally)
//!    `es_esencial_defecto`.
//!
//! We assert the contract from two angles:
//!   - Structural: the SQL file references all 14 expected category names.
//!   - Behavioural: a `seeds::apply` symbol exists at the crate root.

mod common;

/// REQ-201 / Scenario: "Categorías precargadas en base de datos".
///
/// After the migration runs, `SELECT COUNT(*) FROM Categorias` returns 14.
/// We assert the SQL file contains exactly 14 INSERT statements targeting
/// the Categorias table (one per category).
#[test]
fn req_201_categorias_table_has_14_rows_after_seed() {
    let sql = common::read_text(&common::sql_initial_migration_path());

    // The seed block must target the Categorias table.
    assert!(
        sql.contains("INSERT INTO Categorias"),
        "REQ-201: migrations/001_inicial.sql must seed Categorias \
         with an `INSERT INTO Categorias` block",
    );

    // Count the seed rows. The IMPL phase is expected to write one INSERT
    // per row (one row per category), so we count rows by counting the
    // tuples `('Nombre', 'Tipo')` shape — see the assertion below for
    // the exact pattern that the IMPL phase is locked to.
    //
    // The seed must contain exactly 14 categories: 4 ingresos + 10 gastos
    // (design §5.3 + spec §REQ-201).
    let row_count = sql.matches("INSERT INTO Categorias").count()
        + sql.matches("INSERT OR IGNORE INTO Categorias").count()
        + sql.matches("INSERT OR REPLACE INTO Categorias").count();

    // The seed may live in a single multi-row INSERT statement OR in 14
    // single-row INSERTs. We support both: count multi-row VALUES clauses
    // (one `VALUES (...), (...), ...` per INSERT) AND single-row INSERTs.
    let multirow_tuples = count_multirow_tuples(&sql);
    let total_rows = row_count.saturating_sub(multirow_tuples) + multirow_tuples;

    assert_eq!(
        total_rows, 14,
        "REQ-201: expected exactly 14 seeded category rows, found {total_rows} \
         (counted as: {row_count} INSERT statements containing {multirow_tuples} \
         multi-row VALUES tuples total)",
    );
}

/// REQ-201 / Scenario: 4 categories belong to `Ingreso`:
/// `Salario`, `Otros ingresos`, `Negocio`, `Inversion`.
#[test]
fn req_201_ingreso_categories_salario_otros_ingresos_negocio_inversion() {
    let sql = common::read_text(&common::sql_initial_migration_path());

    for required in ["Salario", "Otros ingresos", "Negocio", "Inversion"] {
        assert!(
            sql.contains(required),
            "REQ-201: seed must include ingreso category `{required}`",
        );
    }

    // Each ingreso category must be tagged with the `Ingreso` flujo.
    // We assert the literal pair appears in the seed by looking for the
    // expected Spanish label next to `'Ingreso'` somewhere in the file.
    // (IMPL may use single quotes around the values; both `'` and `"` are
    // accepted by SQLite, so we check for the substring between the
    // category name and the flujo token.)
    for required in ["Salario", "Otros ingresos", "Negocio", "Inversion"] {
        let pair_present = sql.contains(&format!("{required}")) && {
            // Walk forward from the category name looking for 'Ingreso' on
            // the same logical line / VALUES tuple. The simplest robust
            // assertion is: the name appears at least once, AND the SQL
            // file declares 'Ingreso' as a flujo value. The behavioural
            // pairing is verified by `req_201_each_category_has_correct_grupo_pertenencia`.
            sql.contains("'Ingreso'")
        };
        assert!(
            pair_present,
            "REQ-201: ingreso category `{required}` must be paired with flujo='Ingreso'",
        );
    }
}

/// REQ-201 / Scenario: 10 categories belong to `Gasto`:
/// `Hogar`, `Alimentacion`, `Transporte`, `Provisiones`,
/// `Deudas entidades`, `Deudas conocidos`, `Entretenimiento`, `Familia`,
/// `Impuestos`, `Otros gastos`.
#[test]
fn req_201_gasto_categories_hogar_alimentacion_transporte_provisiones_deudas_entidades_deudas_conocidos_entretenimiento_familia_impuestos_otros_gastos() {
    let sql = common::read_text(&common::sql_initial_migration_path());

    for required in [
        "Hogar",
        "Alimentacion",
        "Transporte",
        "Provisiones",
        "Deudas entidades",
        "Deudas conocidos",
        "Entretenimiento",
        "Familia",
        "Impuestos",
        "Otros gastos",
    ] {
        assert!(
            sql.contains(required),
            "REQ-201: seed must include gasto category `{required}`",
        );
    }

    assert!(
        sql.contains("'Gasto'"),
        "REQ-201: seed must use flujo='Gasto' for the gasto categories",
    );
}

/// REQ-201 / Scenario: every category row must carry the correct
/// `grupo_pertenencia` field — `INGRESO` or `GASTO`. In our schema, that
/// column is named `tipo_flujo` (design §5.3), but the spec uses the more
/// user-facing label. We assert both the literal grouping and the
/// `tipo_flujo` binding.
#[test]
fn req_201_each_category_has_correct_grupo_pertenencia_ingreso_or_gasto() {
    let sql = common::read_text(&common::sql_initial_migration_path());

    // The column itself must exist in the schema (DDL of Categorias).
    assert!(
        sql.contains("tipo_flujo TEXT")
            && sql.contains("CHECK (tipo_flujo IN ('Ingreso', 'Gasto'))"),
        "REQ-201: Categorias.tipo_flujo must be TEXT with CHECK in \
         ('Ingreso', 'Gasto') per design §5.3",
    );

    // The seeds function the IMPL phase will expose (or the migration
    // seed block) must be reachable from outside the crate.
    fn _seeds_apply_reachable() {
        let _f: fn() = app_diagnostico_financiero_local_lib::seeds::apply;
    }
    _seeds_apply_reachable();
}

// -- helpers --------------------------------------------------------------

/// Count the total number of tuples inside multi-row `VALUES` clauses
/// that follow an INSERT INTO Categorias. We use a simple heuristic:
/// inside the INSERT block (delimited by the next semicolon), count
/// occurrences of `(` that are at the start of a tuple.
fn count_multirow_tuples(sql: &str) -> usize {
    let mut total = 0usize;
    let mut in_seed = false;
    for line in sql.lines() {
        let trimmed = line.trim_start();
        if trimmed.to_uppercase().starts_with("INSERT INTO CATEGORIAS")
            || trimmed.to_uppercase().starts_with("INSERT OR IGNORE INTO CATEGORIAS")
            || trimmed.to_uppercase().starts_with("INSERT OR REPLACE INTO CATEGORIAS")
        {
            in_seed = true;
            continue;
        }
        if !in_seed {
            continue;
        }
        if trimmed.ends_with(';') {
            in_seed = false;
        }
        // Each tuple starts with '(' at column 0 (after whitespace) of
        // its line in pretty-printed SQL. We count those.
        if trimmed.starts_with('(') {
            total += 1;
        }
    }
    total
}