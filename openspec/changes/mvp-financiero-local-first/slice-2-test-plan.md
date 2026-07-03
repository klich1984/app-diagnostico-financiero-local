# Slice 2 — Plan de tests (fase RED)

> Documento de planificación de la fase RED de Slice 2 (Épica 1: persistencia
> + puente a Épica 2). Cubre REQ-103, REQ-104, REQ-105, REQ-106 y REQ-201.
> El detalle por REQ vive en `openspec/changes/mvp-financiero-local-first/spec.md`
> y `openspec/changes/mvp-financiero-local-first/design.md` §5/§6.

## 1. Alcance

| REQ     | Tarea | Descripción corta                                                    |
| ------- | ----- | -------------------------------------------------------------------- |
| REQ-103 | T-104 | Migraciones versionadas y esquema inicial (4 tablas + `_migrations`) |
| REQ-104 | T-105 | Integración `tauri-plugin-sql` con feature `sqlite`                  |
| REQ-105 | T-105 | Capacidades SQL restringidas (sin fs/shell/http, scope a `main`)     |
| REQ-106 | T-106 | Resolución de la ruta de DB en `BaseDirectory::App/misfinanzas.db`   |
| REQ-201 | T-201 | Sembrado de las 14 categorías iniciales (4 ingresos + 10 gastos)     |

## 2. Archivos creados en esta fase

```
src-tauri/tests/
├── common/
│   └── mod.rs               ← helpers compartidos (paths a SQL, Cargo.toml, capabilities)
├── migrations_test.rs       ← REQ-103 (4 tests)
├── sql_plugin_test.rs       ← REQ-104 (3 tests)
├── capabilities_test.rs     ← REQ-105 (3 tests)
├── db_path_test.rs          ← REQ-106 (3 tests)
└── categorias_seed_test.rs  ← REQ-201 (4 tests)
```

Total: **17 tests** distribuidos en 5 archivos, más el helper `common/mod.rs`.

## 3. Qué valida cada archivo

### `migrations_test.rs` (REQ-103)

| Test                                                  | Mecanismo            | Estado RED                                |
| ----------------------------------------------------- | -------------------- | ----------------------------------------- |
| `req_103_creates_all_four_tables_on_first_run`        | Texto SQL en disco   | ASSERTION: el archivo no existe aún       |
| `req_103_transacciones_table_has_integer_columns…`    | Texto SQL en disco   | ASSERTION: el archivo no existe aún       |
| `req_103_applies_migrations_only_once_idempotent`     | Símbolo Rust         | COMPILE-FAIL: `migrations` no declarado   |
| `req_103_migration_version_is_recorded_in_the…`       | Texto SQL en disco   | ASSERTION: el archivo no existe aún       |

### `sql_plugin_test.rs` (REQ-104)

| Test                                                                  | Mecanismo                | Estado RED                                |
| --------------------------------------------------------------------- | ------------------------ | ----------------------------------------- |
| `req_104_cargo_toml_declares_sqlite_feature_for_tauri_plugin_sql`     | `Cargo.toml` en disco    | PASA (ya está la feature) — guard test    |
| `req_104_capabilities_default_json_allows_sql_default_…`              | `capabilities/default.json` + símbolo Rust | MIXTO: el test 1 del archivo falla por la aserción sobre `sql:default`; los paths a `plugin` y `path` fallan al compilar |
| `req_104_db_path_is_base_directory_app_misfinanzas_db`                | Símbolo Rust             | COMPILE-FAIL: `path` no declarado         |

### `capabilities_test.rs` (REQ-105)

| Test                                                                  | Mecanismo                | Estado RED                                |
| --------------------------------------------------------------------- | ------------------------ | ----------------------------------------- |
| `req_105_capabilities_default_json_contains_sql_default_permission`   | `capabilities/default.json` | ASSERTION FAIL: `sql:default` ausente  |
| `req_105_capabilities_default_json_does_not_contain_fs_default_…`     | `capabilities/default.json` | PASA — guard test                       |
| `req_105_capabilities_default_json_has_scope_to_main_window_only`     | `capabilities/default.json` | PASA — guard test                       |

### `db_path_test.rs` (REQ-106)

| Test                                          | Mecanismo    | Estado RED                                |
| --------------------------------------------- | ------------ | ----------------------------------------- |
| `req_106_db_path_returns_a_path_inside_the…`  | Símbolo Rust | COMPILE-FAIL: `path` no declarado         |
| `req_106_db_path_suffix_is_misfinanzas_db`    | Símbolo Rust | COMPILE-FAIL: `path` no declarado         |
| `req_106_db_path_is_stable_across_calls`      | Símbolo Rust | COMPILE-FAIL: `path` no declarado         |

### `categorias_seed_test.rs` (REQ-201)

| Test                                          | Mecanismo             | Estado RED                                |
| --------------------------------------------- | --------------------- | ----------------------------------------- |
| `req_201_categorias_table_has_14_rows_after_seed`         | Texto SQL en disco    | ASSERTION: el archivo no existe aún       |
| `req_201_ingreso_categories_salario_otros_ingresos_…`     | Texto SQL en disco    | ASSERTION: el archivo no existe aún       |
| `req_201_gasto_categories_hogar_alimentacion_…`           | Texto SQL en disco    | ASSERTION: el archivo no existe aún       |
| `req_201_each_category_has_correct_grupo_pertenencia_…`   | Texto SQL + símbolo   | COMPILE-FAIL: `seeds` no declarado        |

## 4. Decisiones de diseño de los tests

1. **Sin dependencias nuevas en `Cargo.toml`**. La fase RED no agrega
   `rusqlite`, `tempfile`, ni nada que la fase IMPL deba introducir. Las
   pruebas estructurales sobre el SQL se hacen leyendo el archivo
   `migrations/001_inicial.sql` desde disco, no abriendo una conexión real.

2. **Símbolos no existentes = RED via compile-fail**. Los tests que
   dependen de código Rust referencian módulos (`migrations`, `path`,
   `plugin`, `seeds`) que la fase IMPL deberá declarar. Esto produce
   errores `E0433: cannot find …` en `cargo test --no-run`, que es la
   forma idiomática de TDD en Rust: el test no compila hasta que la
   implementación existe.

3. **Pin de signature para la fase IMPL**. Cada test que falla por
   compile documenta, en su docstring, la signature que se espera:
   - `app_diagnostico_financiero_local_lib::migrations::run_all()`
   - `app_diagnostico_financiero_local_lib::path::db_path(&Path) -> PathBuf`
   - `app_diagnostico_financiero_local_lib::plugin::BUILDER`
   - `app_diagnostico_financiero_local_lib::seeds::apply()`

   La fase IMPL puede decidir si estos viven en el top-level del crate
   o bajo `db::`, `db::path::`, etc. Si elige `db::`, basta con agregar
   `pub use db::migrations;` (y similares) en `lib.rs` — los tests
   siguen resolviendo.

4. **`req_104_capabilities_default_json_allows_sql_default_…` es mixto**.
   Parte de su lógica (assertion sobre el JSON) compila, y fallará en
   runtime con un mensaje claro. La otra parte (referencia al símbolo
   `plugin::BUILDER`) sí falla por compile. Eso es esperado y útil: el
   developer que corra `cargo test` sin compilar verá el primer error
   de compile y, cuando lo arregle, verá el fallo de assertion
   siguiente.

5. **Tests que pasan hoy, intencionalmente**. `req_104_cargo_toml_…`,
   `req_105_capabilities_…_does_not_contain_…`,
   `req_105_…_has_scope_to_main_window_only` ya pasan. Son **guard
   tests**: su propósito es *prevenir* que una refactorización futura
   introduzca `fs:default` o pierda el scope a `main`. No se borran al
   pasar a GREEN.

## 5. Cómo se llega a GREEN

La fase IMPL (delegada a otro agente) debe:

1. Crear `src-tauri/src/db/` con `mod.rs`, `migrations.rs`, `path.rs`,
   `seeds.rs`, `plugin.rs` (o los nombres que elija — los tests están
   preparados para re-exports).
2. Agregar `pub mod migrations; pub mod path; pub mod seeds; pub mod plugin;`
   en `lib.rs` (o reorganizar para que `db::migrations` se re-exponga
   como `crate::migrations`).
3. Crear `migrations/001_inicial.sql` con los 4 `CREATE TABLE`, los
   CHECK constraints, los índices y los 14 `INSERT INTO Categorias`.
4. Declarar `sql:default`, `sql:allow-execute`, `sql:allow-select` en
   `capabilities/default.json`.
5. Agregar `rusqlite` (u otra lib SQLite) a `Cargo.toml` para que la
   IMPL corra las migraciones. Los tests de RED no la necesitan.

## 6. Riesgos conocidos

- **Resolución de la connection real**: la fase IMPL tendrá que decidir
  el tipo concreto de la conexión (`rusqlite::Connection`, un wrapper
  propio, o `tauri_plugin_sql::Migration`). Los tests de RED solo
  pinnean símbolos sin tipos concretos para no atar la mano al IMPL.
- **Conteo de filas del seed**: el helper `count_multirow_tuples` usa
  una heurística (busca tuplas que empiezan con `(` por línea). Si la
  IMPL genera el SQL con un formateador distinto (todo en una sola
  línea), el conteo podría romperse. La IMPL puede ajustar el
  contador — o el IMPL puede comprometerse a una forma específica
  (recomendado: una sola multi-row `INSERT INTO Categorias VALUES
  (...), (...), ...;` con 14 tuplas).

## 7. Estado de esta fase

> **Esta es la fase RED. La fase IMPL se delega en un agente separado.
> Los tests actualmente fallan al compilar.**

Comprobado en `cargo test --no-run`:

```
error: could not compile `app-diagnostico-financiero-local` (test "migrations_test") due to 1 previous error
error: could not compile `app-diagnostico-financiero-local` (test "sql_plugin_test") due to 2 previous errors
error: could not compile `app-diagnostico-financiero-local` (test "db_path_test") due to 4 previous errors
error: could not compile `app-diagnostico-financiero-local` (test "categorias_seed_test") due to 1 previous error
warning: `app-diagnostico-financiero-local` (test "capabilities_test") generated 2 warnings
```

4 de los 5 archivos fallan al compilar por `E0433: cannot find …` sobre
los módulos `migrations`, `path`, `plugin`, `seeds`. El quinto
(`capabilities_test`) compila y su primer test fallará en runtime hasta
que `capabilities/default.json` declare `sql:default`.
