//! CRUD para la tabla `Simulador` (REQ-402 + REQ-403).
//!
//! Ver `openspec/changes/mvp-financiero-local-first/spec.md` §REQ-402 y
//! `design.md` §5.5 (DDL `Simulador`) + §10 (Panel Simulador). Cada
//! función recibe un `&Connection` de `rusqlite` para que las pruebas
//! de integración puedan correr contra DBs en memoria sin instanciar
//! el runtime de Tauri.
//!
//! Reglas duras (de la tabla `Simulador` y del contrato de Slice 5):
//!   * `nuevo_valor_centavos >= 0` se enforce con el CHECK de la columna.
//!   * El `UNIQUE (transaccion_id)` se traduce en un "upsert"
//!     (insert-or-update) en `repo::upsert` — nunca quedan dos filas
//!     apuntando al mismo `Transaccion.id`.
//!   * `Simulador.usuario_id` se hidrata desde `Transacciones.usuario_id`
//!     (no lo recibe el caller) para mantener la FK coherente.
//!
//! Esos CHECKs viven en `migrations/001_inicial.sql` y se aplican vía
//! `crate::migrations::apply_all`. Este módulo NO los reproduce: se
//! apoya en el SQL para que la lógica de validación quede en un solo
//! lugar.

pub mod repo;