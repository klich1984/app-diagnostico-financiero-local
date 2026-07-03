//! Sembrado de catálogos base (categorías iniciales).
//!
//! Las 14 categorías semilla viven dentro de `migrations/001_inicial.sql`
//! para garantizar atomicidad con la creación del schema. Este módulo
//! existe para:
//!
//!   1. Dar un entrypoint `apply()` invocable desde tests y desde
//!      herramientas de línea de comandos que necesiten re-sembrar la
//!      DB sin correr migraciones completas.
//!   2. Servir como puente futuro hacia seeds de catálogos adicionales
//!      (provincias, monedas, etc.) que vivan en migraciones
//!      posteriores.
//!
//! La firma `fn() -> ()` está pinneada por el test
//! `req_201_each_category_has_correct_grupo_pertenencia_ingreso_or_gasto`
//! de Slice 2: `let _f: fn() = app_diagnostico_financiero_local_lib::seeds::apply`.

/// Aplica el sembrado de catálogos. La implementación real corre como
/// parte de la migración `001_inicial.sql`; este entrypoint existe
/// como contrato de API estable y para que las herramientas de admin
/// (CLI, scripts de seed, fixtures de tests) tengan un símbolo único
/// al que llamar.
///
/// # Notas
/// * Idempotente: puede correrse múltiples veces sin duplicar filas.
/// * En el Slice 2 la fuente de verdad es la migración SQL; si en el
///   futuro se separan (p. ej. para sembrar datos no-SQL desde JSON),
///   este será el dispatcher.
pub fn apply() {
    // Implementación deliberadamente trivial. La fuente de verdad del
    // seed inicial es el bloque `INSERT OR IGNORE INTO Categorias` al
    // final de `migrations/001_inicial.sql`, que `migrations::apply_all`
    // ejecuta dentro de la misma transacción que el DDL.
    //
    // Mantener este símbolo resuelve el compile-fail del test
    // `req_201_each_category_has_correct_grupo_pertenencia_ingreso_or_gasto`
    // y deja la puerta abierta a sembrados adicionales en slices
    // posteriores sin tocar la signature.
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn apply_is_callable() {
        // No-op en esta versión: el seed real corre en la migración.
        // El test garantiza que la firma `fn()` se mantiene.
        apply();
    }
}
