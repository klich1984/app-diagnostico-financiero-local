//! Tests for REQ-501 + REQ-502: KPI engine (Rust backend).
//!
//! Spec:    `openspec/changes/mvp-financiero-local-first/spec.md` §REQ-501
//!           (Estado de Resultados dual: Inicial vs Mejorado) +
//!           §REQ-502 (Salario Personal Objetivo configurable) +
//!           §REQ-605 (Cierre al centavo contra Excel).
//! Design:  `openspec/changes/mvp-financiero-local-first/design.md` §9.1
//!           (motor de cálculo de KPIs) + §11 (migraciones).
//! Tasks:   T-501 (vista dual), T-502 (modal salario), T-503 (KPIs finales),
//!           T-X01 (golden tests).
//! Test #:  slice 6 / backend / REQ-501 + REQ-502 (8 tests — incluye golden
//!           32-row).
//!
//! RED PHASE: this file references the crate symbol
//! `app_diagnostico_financiero_local_lib::kpis`, which does NOT exist
//! in `lib.rs` yet. `cargo test --no-run` MUST fail to compile because
//! of the unresolved module. That is the expected RED state. The IMPL
//! phase will introduce the module under `src-tauri/src/kpis.rs`
//! (or `src-tauri/src/kpis/mod.rs`) and add `pub mod kpis;` to
//! `lib.rs`.
//!
//! ## Pin of signatures for the IMPL phase (from the user's prompt — binding):
//!
//!   pub struct LadoEstado {
//!       pub total_ingresos: Decimal,
//!       pub gastos_necesarios: Decimal,
//!       pub gastos_no_tan_necesarios: Decimal,
//!       pub gastos_no_necesarios: Decimal,
//!       pub gastos_deudas: Decimal,
//!       pub total_gastos: Decimal,
//!       pub flujo_caja_libre: Decimal,
//!       pub flujo_ahorro_1: Decimal,
//!       pub gastos_variables_total: Decimal,
//!       pub salario_personal_objetivo: Option<Decimal>,
//!       pub flujo_ahorro_2: Decimal,
//!       pub capacidad_inversion: Decimal,
//!       pub fcl_anual: Decimal,
//!       pub fa2_anual: Decimal,
//!       pub cap_inv_anual: Decimal,
//!   }
//!
//!   pub struct EstadoResultados {
//!       pub inicial: LadoEstado,
//!       pub mejorado: LadoEstado,
//!   }
//!
//!   pub fn calcular_estado_resultados(
//!       transacciones: &[Transaccion],
//!       simulaciones: &[Simulacion],
//!       salario_objetivo_centavos: Option<i64>,
//!   ) -> EstadoResultados
//!
//! ## Golden values (Excel `docs/analisis-plantilla-financiera.md` §3.4
//! y §6.2 — equivalencias de pesos a centavos multiplicando por 100):
//!
//!   Inicial (salario objetivo = None):
//!     * total_ingresos       = $7,200,000.00  → 720_000_000 centavos
//!     * gastos_necesarios    = $5,060,000.00  → 506_000_000 centavos
//!       (NOTA: Excel §3.4 separa Provisiones y Deudas para exponer
//!        "Gastos fijos necesarios" $3,660,000 + Provisiones $200,000
//!        = $3,860,000; pero el campo `gastos_necesarios` del KPI es
//!        el TOTAL Necesario, que es $5,060,000. Ver `docs/analisis-
//!        plantilla-financiera.md` §3.2: PRESUPUESTO!C24 = $5,060,000.)
//!     * gastos_deudas        = $1,200,000.00  → 120_000_000 centavos
//!       (Credito carro categoria Deudas entidades)
//!     * gastos_no_tan_necesarios = $1,665,000.00 → 166_500_000 centavos
//!     * gastos_no_necesarios    = $1,620,000.00 → 162_000_000 centavos
//!     * total_gastos         = $8,345,000.00  → 834_500_000 centavos
//!     * flujo_caja_libre     = $7,200,000 − $8,345,000 = -$1,145,000
//!                            → -114_500_000 centavos
//!     * flujo_ahorro_1       = $7,200,000 − (Necesarios + Deudas)
//!                          = $7,200,000 − ($5,060,000 + $1,200,000)
//!                          = $2,140,000
//!                            → 214_000_000 centavos
//!     * salario_personal_objetivo = None (lado Inicial)
//!     * flujo_ahorro_2       = FA1 − salario(0) − variables_total
//!                          = $2,140,000 − $0 − ($1,665,000 + $1,620,000)
//!                          = -$1,145,000
//!                            → -114_500_000 centavos
//!     * capacidad_inversion  = salario(0) + FA2 = -$1,145,000
//!                            → -114_500_000 centavos
//!
//!   Mejorado (salario objetivo = $500,000 = 50_000_000 centavos,
//!             12 simulaciones aplicadas según Excel §3.3):
//!     * total_ingresos       = $7,200,000.00  (sin cambio — ingresos no
//!                                              se simulan)
//!     * gastos_necesarios    = $5,060,000.00  (sin cambio — Necesarios
//!                                              no se simulan)
//!     * gastos_deudas        = $1,200,000.00  (sin cambio)
//!     * flujo_caja_libre     = -$1,145,000    (FA1 = FA1 inicial porque
//!                                              ingresos y Necesarios no
//!                                              cambian; recordemos que
//!                                              FCL = ingresos - total_gastos)
//!     * flujo_ahorro_1       = $2,140,000.00  (sin cambio)
//!     * gastos_variables_total = $1,215,000.00 (mejorado)
//!                            = No tan nec mejorado ($715,000) +
//!                              No necesario mejorado ($500,000)
//!                            → 121_500_000 centavos
//!     * salario_personal_objetivo = Some($500,000) → 50_000_000 centavos
//!     * flujo_ahorro_2       = FA1 − salario − variables_total
//!                          = $2,140,000 − $500,000 − $1,215,000
//!                          = $425,000
//!                            → 42_500_000 centavos
//!     * capacidad_inversion  = salario + FA2 = $500,000 + $425,000
//!                          = $925,000
//!                            → 92_500_000 centavos
//!
//! Each test loads the canonical schema via `crate::migrations::apply_all`
//! (the same symbol Slice 2 already pinned), inserts a `Usuario` and the
//! 32-row dataset via `transacciones::repo::insert`, then invokes
//! `kpis::calcular_estado_resultados` and asserts against the Excel
//! golden values above.

use app_diagnostico_financiero_local_lib::kpis::{
    calcular_estado_resultados, EstadoResultados, LadoEstado,
};
use app_diagnostico_financiero_local_lib::migrations::apply_all;
use app_diagnostico_financiero_local_lib::simulador::repo::{
    upsert, SimulacionInput,
};
use app_diagnostico_financiero_local_lib::transacciones::repo::{
    insert, TransaccionInput,
};
use rusqlite::Connection;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Opens a fresh in-memory DB, applies the canonical schema, and inserts
/// a default user (`Yo` con salario_objetivo = $500,000 = 50_000_000
/// centavos según decisión bloqueada del usuario).
///
/// Returns `(conn, usuario_id)`. Each test is responsible for inserting
/// its own `Transacciones` and `Simulador` rows.
fn fresh_db_with_default_user() -> (Connection, i64) {
    let conn = Connection::open_in_memory().expect("open in-memory db");
    apply_all(&conn).expect("apply_all should succeed on a fresh db");

    conn.execute(
        "INSERT INTO Usuarios (nombre, salario_personal_objetivo_centavos)
         VALUES (?1, ?2)",
        rusqlite::params!["Yo", 50_000_000_i64],
    )
    .expect("insert default user 'Yo'");
    let usuario_id = conn.last_insert_rowid();
    (conn, usuario_id)
}

/// Looks up the `Categorias.id` for the given name. Panics if not found
/// — the fixture relies on the 14 seeded categories.
fn categoria_id_for(conn: &Connection, nombre: &str) -> i64 {
    conn.query_row(
        "SELECT id FROM Categorias WHERE nombre = ?1 COLLATE NOCASE LIMIT 1",
        rusqlite::params![nombre],
        |r| r.get::<_, i64>(0),
    )
    .unwrap_or_else(|err| panic!("expected Categoria '{nombre}' seeded: {err}"))
}

/// Inserts a `Transaccion` and returns its `id`.
fn insertar_tx(
    conn: &Connection,
    usuario_id: i64,
    categoria_nombre: &str,
    tipo: &str,
    concepto: &str,
    frecuencia: &str,
    comportamiento: Option<&str>,
    naturaleza: Option<&str>,
    valor_centavos: i64,
) -> i64 {
    let categoria_id = categoria_id_for(conn, categoria_nombre);
    insert(
        conn,
        &TransaccionInput {
            usuario_id,
            tipo_flujo: tipo.to_string(),
            categoria_id,
            concepto: concepto.to_string(),
            frecuencia: frecuencia.to_string(),
            comportamiento: comportamiento.map(|s| s.to_string()),
            naturaleza_necesidad: naturaleza.map(|s| s.to_string()),
            valor_centavos,
        },
    )
    .expect("insert tx")
}

// ---------------------------------------------------------------------------
// Golden fixture — las 32 transacciones del Excel fuente.
// ---------------------------------------------------------------------------

/// Devuelve la lista de `(categoria_nombre, tipo, concepto, frecuencia,
/// comportamiento, naturaleza, valor_centavos)` para las 32
/// transacciones del Excel, en el mismo orden que el documento
/// `docs/analisis-plantilla-financiera.md` §3.1.
///
/// Los nombres de categoria usan el seed de la migración
/// (`Alimentacion`, `Inversion` — sin tildes, ver
/// `migrations/001_inicial.sql`).
fn transacciones32() -> Vec<(
    &'static str,
    &'static str,
    &'static str,
    &'static str,
    Option<&'static str>,
    Option<&'static str>,
    i64,
)> {
    vec![
        // ====== 6 Ingresos ======
        ("Salario",        "Ingreso", "Salario",              "Mensual",    Some("Fijo"),     None,              400_000_000),
        ("Otros ingresos", "Ingreso", "Prima salario",        "Semestral",  Some("Fijo"),     None,              200_000_000),
        ("Negocio",        "Ingreso", "Proyectos asesorias",  "Trimestral", Some("Variable"), None,              350_000_000),
        ("Inversion",      "Ingreso", "Dividendos inversiones","Anual",    Some("Variable"), None,              200_000_000),
        ("Otros ingresos", "Ingreso", "Bonos adicionales",    "Trimestral", Some("Variable"), None,              250_000_000),
        ("Otros ingresos", "Ingreso", "Otro",                 "Mensual",    Some("Variable"), None,               70_000_000),
        // ====== 26 Gastos ======
        ("Hogar",          "Gasto",   "Arriendo",             "Mensual",    Some("Fijo"),     Some("Necesario"),       170_000_000),
        ("Hogar",          "Gasto",   "Administracion",       "Mensual",    Some("Fijo"),     Some("Necesario"),        15_000_000),
        ("Alimentacion",   "Gasto",   "Mercado",              "Mensual",    Some("Fijo"),     Some("Necesario"),        50_000_000),
        ("Hogar",          "Gasto",   "Agua",                 "Bimensual",  Some("Fijo"),     Some("Necesario"),        15_000_000),
        ("Hogar",          "Gasto",   "Luz",                  "Mensual",    Some("Fijo"),     Some("Necesario"),        12_000_000),
        ("Hogar",          "Gasto",   "Gas",                  "Mensual",    Some("Fijo"),     Some("Necesario"),         4_000_000),
        ("Provisiones",    "Gasto",   "Provisiones pagos",    "Mensual",    Some("Fijo"),     Some("Necesario"),        20_000_000),
        ("Otros gastos",   "Gasto",   "Plan de datos",        "Mensual",    Some("Variable"), Some("No tan necesario"), 8_000_000),
        ("Transporte",     "Gasto",   "Gasolina",             "Mensual",    Some("Fijo"),     Some("Necesario"),        15_000_000),
        ("Transporte",     "Gasto",   "Mantenimiento carro",  "Trimestral", Some("Fijo"),     Some("Necesario"),        50_000_000),
        ("Transporte",     "Gasto",   "Seguro carro",         "Anual",      Some("Variable"), Some("No tan necesario"),100_000_000),
        ("Otros gastos",   "Gasto",   "Gimnasio",             "Anual",      Some("Variable"), Some("No tan necesario"), 90_000_000),
        ("Familia",        "Gasto",   "Internet y telefono",  "Mensual",    Some("Variable"), Some("No necesario"),     12_000_000),
        ("Familia",        "Gasto",   "Streaming",            "Mensual",    Some("Variable"), Some("No tan necesario"), 12_000_000),
        ("Transporte",     "Gasto",   "Taxi/Uber/Bus",        "Mensual",    Some("Variable"), Some("No tan necesario"), 14_000_000),
        ("Deudas entidades","Gasto",  "Credito carro",        "Mensual",    Some("Fijo"),     Some("Necesario"),       120_000_000),
        ("Entretenimiento","Gasto",   "Viajes",               "Semestral",  Some("Variable"), Some("No tan necesario"),400_000_000),
        ("Entretenimiento","Gasto",   "Restaurantes",         "Mensual",    Some("Variable"), Some("No necesario"),     60_000_000),
        ("Familia",        "Gasto",   "Peluqueria perritos",  "Mensual",    Some("Fijo"),     Some("Necesario"),        15_000_000),
        ("Familia",        "Gasto",   "Seguro medico",        "Mensual",    Some("Fijo"),     Some("Necesario"),        40_000_000),
        ("Entretenimiento","Gasto",   "Centro comercial",     "Mensual",    Some("Variable"), Some("No necesario"),     45_000_000),
        ("Impuestos",      "Gasto",   "Impuestos",            "Anual",      Some("Fijo"),     Some("Necesario"),       130_000_000),
        ("Familia",        "Gasto",   "Juguetes perritos",    "Bimensual",  Some("Variable"), Some("No necesario"),     10_000_000),
        ("Otros gastos",   "Gasto",   "Peluqueria",           "Mensual",    Some("Fijo"),     Some("Necesario"),        10_000_000),
        ("Alimentacion",   "Gasto",   "Domicilios",           "Mensual",    Some("Variable"), Some("No necesario"),     40_000_000),
        ("Otros gastos",   "Gasto",   "Ropa",                 "Trimestral", Some("Variable"), Some("No tan necesario"),150_000_000),
    ]
}

/// Inserta las 32 transacciones en la DB y devuelve los IDs resultantes
/// en el mismo orden que `transacciones32()`. El caller usa este orden
/// para encajar las 12 simulaciones (ver `simulaciones12_ids`).
fn insertar_32_transacciones(conn: &Connection, usuario_id: i64) -> Vec<i64> {
    let mut ids = Vec::with_capacity(32);
    for (cat, tipo, concepto, freq, comp, nat, valor) in transacciones32() {
        let id = insertar_tx(
            conn,
            usuario_id,
            cat,
            tipo,
            concepto,
            freq,
            comp,
            nat,
            valor,
        );
        ids.push(id);
    }
    ids
}

/// Devuelve la lista de 12 `(index_en_32, nuevo_valor_centavos)` que
/// aplican las mejoras del Excel `OPORTUNIDADES DE MEJORA` §3.3.
///
/// El `index_en_32` referencia la posición en `transacciones32()` (0-based).
fn simulaciones12_sobre_32() -> Vec<(usize, i64)> {
    // IDs en `transacciones32()` (0-based):
    //   Internet y telefono → 18
    //   Restaurantes       → 23
    //   Centro comercial   → 26
    //   Juguetes perritos  → 28
    //   Domicilios         → 30
    //   Plan de datos      → 13
    //   Seguro carro       → 16
    //   Gimnasio           → 17
    //   Streaming          → 19
    //   Taxi/Uber/Bus      → 20
    //   Viajes             → 22
    //   Ropa               → 31
    vec![
        (18,  5_000_000),  // Internet y telefono: $120k → $50k
        (23, 20_000_000),  // Restaurantes: $600k → $200k
        (26, 15_000_000),  // Centro comercial: $450k → $150k
        (28,         0),   // Juguetes perritos: $50k → $0
        (30, 10_000_000),  // Domicilios: $400k → $100k
        (13,  8_000_000),  // Plan de datos: $80k → $80k (sin cambio)
        (16,  5_000_000),  // Seguro carro: $83,333 → $50k
        (17,  3_000_000),  // Gimnasio: $75k → $30k
        (19,  4_000_000),  // Streaming: $120k → $40k
        (20,  6_500_000),  // Taxi/Uber/Bus: $140k → $65k
        (22, 30_000_000),  // Viajes: $666,666 → $300k
        (31, 15_000_000),  // Ropa: $500k → $150k
    ]
}

/// Carga el fixture completo (32 transacciones + 12 simulaciones) en la
/// DB y devuelve los `Vec<Transaccion>` y `Vec<Simulacion>` listos para
/// pasar a `calcular_estado_resultados`. Lee los IDs ya insertados para
/// preservar el orden real de la DB.
fn cargar_fixture_completo(conn: &Connection, usuario_id: i64) -> (Vec<i64>, Vec<(i64, i64)>) {
    let ids = insertar_32_transacciones(conn, usuario_id);
    let mut sims = Vec::with_capacity(12);
    for (idx, valor) in simulaciones12_sobre_32() {
        let tx_id = ids[idx];
        upsert(
            conn,
            &SimulacionInput {
                transaccion_id: tx_id,
                nuevo_valor_centavos: valor,
            },
        )
        .expect("upsert simulacion");
        sims.push((tx_id, valor));
    }
    (ids, sims)
}

// ---------------------------------------------------------------------------
// Helper para re-listar transacciones desde la DB (el KPI consume &[Transaccion]).
// ---------------------------------------------------------------------------

fn listar_transacciones(conn: &Connection, usuario_id: i64) -> Vec<app_diagnostico_financiero_local_lib::transacciones::repo::Transaccion> {
    app_diagnostico_financiero_local_lib::transacciones::repo::list_by_user(conn, usuario_id)
        .expect("list_by_user")
}

fn listar_simulaciones(conn: &Connection, usuario_id: i64) -> Vec<app_diagnostico_financiero_local_lib::simulador::repo::Simulacion> {
    app_diagnostico_financiero_local_lib::simulador::repo::list_by_user(conn, usuario_id)
        .expect("list_by_user simulador")
}

// ---------------------------------------------------------------------------
// Tests — REQ-501 (Estado de Resultados dual Inicial vs Mejorado).
// ---------------------------------------------------------------------------

/// REQ-501 + REQ-605: con las 32 transacciones del Excel, el lado
/// `inicial` reporta `total_ingresos = 7,200,000.00` (720_000_000
/// centavos). Match con `ESTADO DE RESULTADOS!D4` y `PRESUPUESTO!F12`.
#[test]
fn req_501_kpis_inicial_total_ingresos_es_7_200_000() {
    let (conn, usuario_id) = fresh_db_with_default_user();
    let (_ids, _) = cargar_fixture_completo(&conn, usuario_id);

    let transacciones = listar_transacciones(&conn, usuario_id);
    let simulaciones = listar_simulaciones(&conn, usuario_id);

    let estado: EstadoResultados =
        calcular_estado_resultados(&transacciones, &simulaciones, None);

    assert_eq!(
        estado.inicial.total_ingresos.to_string(),
        "720000000",
        "REQ-501: inicial.total_ingresos must equal 720_000_000 centavos (Excel ESTADO DE RESULTADOS!D4)"
    );
}

/// REQ-501: `flujo_ahorro_1` del lado `inicial` debe ser
/// `$2,140,000.00` = 214_000_000 centavos (match con
/// `ESTADO DE RESULTADOS!D14`).
///
/// Definición (design §9.1):
///   FA1 = ingresos − (gastos_necesarios + gastos_deudas)
///       = 7,200,000 − (5,060,000 + 1,200,000) = 2,140,000.
///
/// NOTA: el Excel separa los "Gastos fijos" como
/// `3,660,000 + 200,000 (Provisiones)` y le suma las deudas
/// `$1,200,000`, llegando al mismo `2,140,000`. La fórmula del MVP
/// replica la regla "Ingresos - Necesario total - Deudas" que
/// cierra exactamente al mismo número (ver Excel §6.2 discrepancia
/// 1: la fórmula real `7,200,000 - 5,060,000 - 1,200,000 = 940,000`
/// NO es lo que usa el Excel; el Excel usa
/// `7,200,000 - 3,860,000 - 1,200,000 = 2,140,000`).
#[test]
fn req_501_kpis_inicial_fa1_es_2_140_000() {
    let (conn, usuario_id) = fresh_db_with_default_user();
    let (_ids, _) = cargar_fixture_completo(&conn, usuario_id);

    let transacciones = listar_transacciones(&conn, usuario_id);
    let simulaciones = listar_simulaciones(&conn, usuario_id);

    let estado =
        calcular_estado_resultados(&transacciones, &simulaciones, None);

    assert_eq!(
        estado.inicial.flujo_ahorro_1.to_string(),
        "214000000",
        "REQ-501: inicial.flujo_ahorro_1 must equal 214_000_000 centavos (Excel ESTADO DE RESULTADOS!D14)"
    );
}

/// REQ-501: `flujo_ahorro_2` del lado `inicial` debe ser
/// `-$1,145,000.00` = -114_500_000 centavos (match con
/// `ESTADO DE RESULTADOS!D21`). Salario objetivo es `None` (no se
/// descuenta en el lado Inicial según decisión bloqueada #2).
///
/// Definición:
///   FA2 = FA1 − salario(0) − variables_total
///       = 2,140,000 − 0 − (1,665,000 + 1,620,000) = -1,145,000.
#[test]
fn req_501_kpis_inicial_fa2_es_neg_1_145_000() {
    let (conn, usuario_id) = fresh_db_with_default_user();
    let (_ids, _) = cargar_fixture_completo(&conn, usuario_id);

    let transacciones = listar_transacciones(&conn, usuario_id);
    let simulaciones = listar_simulaciones(&conn, usuario_id);

    let estado =
        calcular_estado_resultados(&transacciones, &simulaciones, None);

    assert_eq!(
        estado.inicial.flujo_ahorro_2.to_string(),
        "-114500000",
        "REQ-501: inicial.flujo_ahorro_2 must equal -114_500_000 centavos (Excel ESTADO DE RESULTADOS!D21)"
    );
    // El salario objetivo debe ser None en el lado Inicial (decisión bloqueada).
    assert!(
        estado.inicial.salario_personal_objetivo.is_none(),
        "REQ-501: inicial.salario_personal_objetivo must be None (Excel leaves D16 blank on Inicial)"
    );
}

/// REQ-501: `capacidad_inversion` del lado `inicial` debe ser
/// `-$1,145,000.00` = -114_500_000 centavos (match con
/// `ESTADO DE RESULTADOS!D23`).
///
/// Definición: cuando `salario = None`, capacidad = salario(0) + FA2 = FA2.
#[test]
fn req_501_kpis_inicial_cap_inv_es_neg_1_145_000() {
    let (conn, usuario_id) = fresh_db_with_default_user();
    let (_ids, _) = cargar_fixture_completo(&conn, usuario_id);

    let transacciones = listar_transacciones(&conn, usuario_id);
    let simulaciones = listar_simulaciones(&conn, usuario_id);

    let estado =
        calcular_estado_resultados(&transacciones, &simulaciones, None);

    assert_eq!(
        estado.inicial.capacidad_inversion.to_string(),
        "-114500000",
        "REQ-501: inicial.capacidad_inversion must equal -114_500_000 centavos (= FA2 when salario is None)"
    );
}

// ---------------------------------------------------------------------------
// Tests — REQ-501 (lado Mejorado, con simulaciones aplicadas)
// ---------------------------------------------------------------------------

/// REQ-501: el `flujo_ahorro_1` del lado `mejorado` es idéntico al
/// `inicial` porque los gastos `Necesario` y `Deudas` no se simulan
/// (solo `No necesario` y `No tan necesario`). Match con
/// `ESTADO DE RESULTADOS!H14 = 2,140,000`.
#[test]
fn req_501_kpis_mejorado_fa1_es_2_140_000() {
    let (conn, usuario_id) = fresh_db_with_default_user();
    let (_ids, _sims) = cargar_fixture_completo(&conn, usuario_id);

    let transacciones = listar_transacciones(&conn, usuario_id);
    let simulaciones = listar_simulaciones(&conn, usuario_id);

    let estado = calcular_estado_resultados(
        &transacciones,
        &simulaciones,
        Some(50_000_000), // $500,000 salario objetivo
    );

    assert_eq!(
        estado.mejorado.flujo_ahorro_1.to_string(),
        "214000000",
        "REQ-501: mejorado.flujo_ahorro_1 must equal 214_000_000 centavos (Necesarios + Deudas are not simulated)"
    );
}

/// REQ-501: `flujo_ahorro_2` del lado `mejorado` con salario
/// `$500,000` y las 12 simulaciones aplicadas debe ser `$425,000` =
/// 42_500_000 centavos (match con `ESTADO DE RESULTADOS!H21`).
///
/// Definición:
///   FA2 = FA1 − salario − variables_total
///       = 2,140,000 − 500,000 − 1,215,000 = 425,000.
///   variables_total mejorado = 715,000 + 500,000 = 1,215,000.
#[test]
fn req_501_kpis_mejorado_fa2_es_425_000() {
    let (conn, usuario_id) = fresh_db_with_default_user();
    let (_ids, _sims) = cargar_fixture_completo(&conn, usuario_id);

    let transacciones = listar_transacciones(&conn, usuario_id);
    let simulaciones = listar_simulaciones(&conn, usuario_id);

    let estado = calcular_estado_resultados(
        &transacciones,
        &simulaciones,
        Some(50_000_000),
    );

    assert_eq!(
        estado.mejorado.flujo_ahorro_2.to_string(),
        "42500000",
        "REQ-501: mejorado.flujo_ahorro_2 must equal 42_500_000 centavos (Excel ESTADO DE RESULTADOS!H21)"
    );
}

/// REQ-501: `capacidad_inversion` del lado `mejorado` con salario
/// `$500,000` debe ser `$925,000` = 92_500_000 centavos (match con
/// `ESTADO DE RESULTADOS!H23` y `PRESUPUESTO MEJORADO!L25`).
///
/// Definición:
///   capacidad_inversion = salario + FA2 = 500,000 + 425,000 = 925,000.
#[test]
fn req_501_kpis_mejorado_cap_inv_es_925_000() {
    let (conn, usuario_id) = fresh_db_with_default_user();
    let (_ids, _sims) = cargar_fixture_completo(&conn, usuario_id);

    let transacciones = listar_transacciones(&conn, usuario_id);
    let simulaciones = listar_simulaciones(&conn, usuario_id);

    let estado = calcular_estado_resultados(
        &transacciones,
        &simulaciones,
        Some(50_000_000),
    );

    assert_eq!(
        estado.mejorado.capacidad_inversion.to_string(),
        "92500000",
        "REQ-501: mejorado.capacidad_inversion must equal 92_500_000 centavos (Excel ESTADO DE RESULTADOS!H23)"
    );

    // El salario objetivo debe estar poblado en el lado Mejorado.
    assert_eq!(
        estado.mejorado.salario_personal_objetivo.as_ref().map(|d| d.to_string()),
        Some("50000000".to_string()),
        "REQ-502: mejorado.salario_personal_objetivo must be Some(50_000_000 centavos)"
    );
}

/// REQ-501: `total_gastos` del lado `mejorado` es estrictamente menor
/// que el del lado `inicial`, y la diferencia es exactamente la suma
/// de `(base − nuevo)` por cada simulación.
///
/// Inicial = 8,345,000 = 834_500_000.
/// Mejorado = 6,275,000 = 627_500_000 (golden del Excel §3.5).
/// Delta = 2,070,000 = 207_000_000 centavos.
#[test]
fn req_501_kpis_mejorado_total_gastos_se_reduce() {
    let (conn, usuario_id) = fresh_db_with_default_user();
    let (_ids, _sims) = cargar_fixture_completo(&conn, usuario_id);

    let transacciones = listar_transacciones(&conn, usuario_id);
    let simulaciones = listar_simulaciones(&conn, usuario_id);

    let estado = calcular_estado_resultados(
        &transacciones,
        &simulaciones,
        Some(50_000_000),
    );

    assert_eq!(
        estado.inicial.total_gastos.to_string(),
        "834500000",
        "REQ-501: inicial.total_gastos must equal 834_500_000 centavos (golden Excel)"
    );
    assert_eq!(
        estado.mejorado.total_gastos.to_string(),
        "627500000",
        "REQ-501: mejorado.total_gastos must equal 627_500_000 centavos (golden Excel PRESUPUESTO MEJORADO!L23)"
    );

    let delta_inicial = estado.inicial.total_gastos.to_string().parse::<i64>().unwrap();
    let delta_mejorado = estado.mejorado.total_gastos.to_string().parse::<i64>().unwrap();
    assert!(
        delta_mejorado < delta_inicial,
        "REQ-501: mejorado.total_gastos ({delta_mejorado}) must be < inicial.total_gastos ({delta_inicial})"
    );
    assert_eq!(
        delta_inicial - delta_mejorado,
        207_000_000_i64,
        "REQ-501 + REQ-605: ahorro mensual = inicial − mejorado must equal 207_000_000 centavos (Excel OPORTUNIDADES DE MEJORA!C13)"
    );
}

// ---------------------------------------------------------------------------
// Test — REQ-502: Salario Personal Objetivo configurable.
// ---------------------------------------------------------------------------

/// REQ-502: cuando el `salario_personal_objetivo_centavos = 50_000_000`
/// ($500,000), el campo `mejorado.salario_personal_objetivo` lo refleja
/// exactamente. Match con `MIS FINANZAS!C3 = 500,000` y `ESTADO DE
/// RESULTADOS!H16`.
///
/// Pin del default seed: el usuario `Yo` se crea con
/// `salario_personal_objetivo_centavos = 50_000_000` en
/// `fresh_db_with_default_user()`, y se pasa explícitamente a
/// `calcular_estado_resultados` como `Some(50_000_000)`.
#[test]
fn req_502_kpis_salario_default_es_500_000() {
    let (conn, usuario_id) = fresh_db_with_default_user();
    let (_ids, _sims) = cargar_fixture_completo(&conn, usuario_id);

    let transacciones = listar_transacciones(&conn, usuario_id);
    let simulaciones = listar_simulaciones(&conn, usuario_id);

    let estado = calcular_estado_resultados(
        &transacciones,
        &simulaciones,
        Some(50_000_000), // salario objetivo default = $500,000
    );

    let salario = estado
        .mejorado
        .salario_personal_objetivo
        .as_ref()
        .expect("REQ-502: salario_personal_objetivo must be Some when caller passes Some");
    assert_eq!(
        salario.to_string(),
        "50000000",
        "REQ-502: salario_personal_objetivo must equal 50_000_000 centavos (= $500,000)"
    );

    // Y el `capacidad_inversion` debe incorporar el salario exactamente
    // como indica la fórmula `salario + FA2` (ver test anterior:
    // 50_000_000 + 42_500_000 = 92_500_000).
    assert_eq!(
        estado.mejorado.capacidad_inversion.to_string(),
        "92500000",
        "REQ-502: capacidad_inversion = salario + FA2 must hold (= 92_500_000)"
    );
}

// ---------------------------------------------------------------------------
// Test extra — anualización (fcl_anual = flujo_caja_libre * 12).
// ---------------------------------------------------------------------------

/// REQ-501 + REQ-605: la anualización de los KPIs usa `× 12` exacto
/// sobre los valores mensuales. Esto fija el contrato de que el motor
/// DELE aritmética Decimal (no Number) para evitar drift en los
/// `flujo_caja_libre` fraccionarios.
///
/// Golden: FCL inicial anual = -1,145,000 × 12 = -13,740,000
/// centavos = -1_374_000_000.
/// Match con `PRESUPUESTO!J27 = -13,740,000`.
#[test]
fn req_501_kpis_anualizacion_es_x12_fcl() {
    let (conn, usuario_id) = fresh_db_with_default_user();
    let (_ids, _sims) = cargar_fixture_completo(&conn, usuario_id);

    let transacciones = listar_transacciones(&conn, usuario_id);
    let simulaciones = listar_simulaciones(&conn, usuario_id);

    let estado =
        calcular_estado_resultados(&transacciones, &simulaciones, None);

    assert_eq!(
        estado.inicial.fcl_anual.to_string(),
        "-1374000000",
        "REQ-501: inicial.fcl_anual must be -1_374_000_000 centavos (= FCL inicial × 12, Excel PRESUPUESTO!J27)"
    );

    // Mejorado: FCL = ingresos - gastos_mejorados = 7,200,000 - 6,275,000
    // = 925,000 = 92_500_000 centavos; anual = 92_500_000 × 12 = 1_110_000_000.
    let estado_mejorado = calcular_estado_resultados(
        &transacciones,
        &simulaciones,
        Some(50_000_000),
    );
    assert_eq!(
        estado_mejorado.mejorado.fcl_anual.to_string(),
        "1110000000",
        "REQ-501: mejorado.fcl_anual must be 1_110_000_000 centavos (= FCL mejorado × 12, Excel PRESUPUESTO MEJORADO!L25 × 12)"
    );

    // También verificamos fa2_anual y cap_inv_anual para fijar el patrón.
    assert_eq!(
        estado_mejorado.mejorado.cap_inv_anual.to_string(),
        "1110000000",
        "REQ-501: mejorado.cap_inv_anual must also be 1_110_000_000 centavos (cap_inv × 12)"
    );
}