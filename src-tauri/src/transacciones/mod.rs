//! Módulo de transacciones (hechos financieros) — slice 3.
//!
//! Ver `design.md` §5 (DDL `Transacciones`), §8 (normalización) y §14 (TDD).
//! La fase RED del Slice 3 fija el path público
//! `app_diagnostico_financiero_local_lib::transacciones::repo`, y este
//! módulo lo expone.
//!
//! Este `mod.rs` es deliberadamente fino: la lógica vive en `repo`.
//! Lo único que agrega es la re-exportación de los tipos públicos para
//! que los tests y el resto del crate importen con un solo path
//! (`transacciones::Transaccion`, `transacciones::TransaccionInput`).

pub mod repo;

pub use repo::{delete, insert, list_by_user, update, Transaccion, TransaccionInput};