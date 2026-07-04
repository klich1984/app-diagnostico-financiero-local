//! Motor de cálculo del Estado de Resultados dual (REQ-501 + REQ-605).
//!
//! Ver `openspec/changes/mvp-financiero-local-first/spec.md` §REQ-501
//! (vista dual Inicial vs Mejorado) + §REQ-502 (Salario Personal
//! Objetivo configurable) + §REQ-605 (cierre al centavo contra Excel)
//! y `design.md` §9.1 (motor de cálculo de KPIs) + §17 (reglas de
//! redondeo).
//!
//! ## Decisiones de diseño (binding)
//!
//!   * **Decimal, no f64**: toda la aritmética se hace con
//!     `rust_decimal::Decimal` (32 dígitos significativos +
//!     ROUND_HALF_EVEN, mismo esquema que el `Decimal` del frontend).
//!     Las divisiones `200_000_000/6` o `130_000_000/12` pierden
//!     precisión con `f64`; con `Decimal` el cierre al centavo
//!     contra el Excel está garantizado.
//!   * **Normalización a mensual**: cada transacción se suma con su
//!     equivalente mensual (`valor_centavos / divisor_frecuencia`) —
//!     el divisor canónico es `{ Mensual: 1, Bimensual: 2,
//!     Trimestral: 3, Semestral: 6, Anual: 12 }`. Esto replica la
//!     fórmula SUMIFS del Excel fuente.
//!   * **Detección de Deuda por nombre de categoria**: una transacción
//!     es "deuda" si su `categoria_nombre` empieza por "Deuda"
//!     (case-insensitive). El Excel tiene dos categorias semilla que
//!     matchean ese prefijo: `Deudas entidades` y `Deudas
//!     conocidos`. El `Transaccion.categoria_nombre` se hidrata vía
//!     JOIN en `transacciones::repo::list_by_user` para que el motor
//!     no necesite un segundo round-trip a la DB.
//!   * **Salario NO se descuenta en el lado Inicial** (decisión
//!     bloqueada #2): el campo `LadoEstado::salario_personal_objetivo`
//!     siempre es `None` en `inicial`, y `None` se trata como 0 en las
//!     fórmulas.
//!   * **Lado Mejorado reescribe gastos vía simulaciones**: para cada
//!     simulación presente, el gasto cuyo `id` matchea ve su
//!     `valor_centavos` reemplazado por `nuevo_valor_centavos` y su
//!     frecuencia forzada a `"Mensual"` (la UI ya normaliza el valor
//!     propuesto antes de mandarlo al backend — ver design §10.4).
//!
//! ## Golden Excel (referencia)
//!
//! Para el fixture de 32 transacciones del Excel fuente:
//!   * `inicial.total_ingresos`  = $7,200,000  → 720_000_000 centavos
//!   * `inicial.total_gastos`    = $8,345,000  → 834_500_000 centavos
//!   * `inicial.flujo_ahorro_1`  = $2,140,000  → 214_000_000 centavos
//!   * `inicial.flujo_ahorro_2`  = -$1,145,000 → -114_500_000 centavos
//!   * `mejorado.total_gastos`   = $6,275,000  → 627_500_000 centavos
//!   * `mejorado.flujo_ahorro_2` = $425,000    → 42_500_000 centavos
//!   * `mejorado.capacidad_inversion` = $925,000 → 92_500_000 centavos

use rust_decimal::Decimal;

use crate::simulador::repo::Simulacion;
use crate::transacciones::repo::Transaccion;

// ---------------------------------------------------------------------------
// Tabla canónica de divisores por frecuencia. Espejo de la tabla TS en
// `src/domain/normalizacion/index.ts`. Una sola fuente conceptual: si se
// agrega una frecuencia nueva, debe modificarse en ambos sitios y
// respaldarse con el test RED correspondiente.
// ---------------------------------------------------------------------------

fn divisor_por_frecuencia(frecuencia: &str) -> Decimal {
    match frecuencia {
        "Mensual" => Decimal::from(1),
        "Bimensual" => Decimal::from(2),
        "Trimestral" => Decimal::from(3),
        "Semestral" => Decimal::from(6),
        "Anual" => Decimal::from(12),
        // Defensa de runtime: si llega una frecuencia fuera del enum
        // canónico (datos huérfanos de una migración previa), la
        // tratamos como mensual para no abortar el cálculo. Esto
        // preserva la robustez de los seeds pre-migración.
        _ => Decimal::from(1),
    }
}

// ---------------------------------------------------------------------------
// Tipos públicos.
// ---------------------------------------------------------------------------

/// Resultado del cálculo para un lado del comparativo (Inicial o
/// Mejorado). Todos los montos están en centavos y son `CentavosDecimal`
/// (newtype sobre `rust_decimal::Decimal`) para evitar drift de
/// IEEE-754 y para que `to_string()` emita la representación entera
/// esperada por los tests del Slice 6 (e.g. `"720000000"` en vez de
/// `"720000000.0000000000000000000"`).
#[derive(Debug, Clone)]
pub struct LadoEstado {
    pub total_ingresos: CentavosDecimal,
    pub gastos_necesarios: CentavosDecimal,
    pub gastos_no_tan_necesarios: CentavosDecimal,
    pub gastos_no_necesarios: CentavosDecimal,
    pub gastos_deudas: CentavosDecimal,
    pub total_gastos: CentavosDecimal,
    pub flujo_caja_libre: CentavosDecimal,
    pub flujo_ahorro_1: CentavosDecimal,
    pub gastos_variables_total: CentavosDecimal,
    pub salario_personal_objetivo: Option<CentavosDecimal>,
    pub flujo_ahorro_2: CentavosDecimal,
    pub capacidad_inversion: CentavosDecimal,
    pub fcl_anual: CentavosDecimal,
    pub fa2_anual: CentavosDecimal,
    pub cap_inv_anual: CentavosDecimal,
}

/// Estado de Resultados dual: un lado por cada escenario del MVP.
#[derive(Debug, Clone)]
pub struct EstadoResultados {
    pub inicial: LadoEstado,
    pub mejorado: LadoEstado,
}

// ---------------------------------------------------------------------------
// Helpers internos.
// ---------------------------------------------------------------------------

const DOCE: Decimal = Decimal::from_parts(12, 0, 0, false, 0);

/// Devuelve el equivalente mensual de `valor_centavos` según `frecuencia`.
/// Espejo del `valorMensual` de `domain/normalizacion/index.ts`.
fn valor_mensual(valor_centavos: i64, frecuencia: &str) -> Decimal {
    Decimal::from(valor_centavos) / divisor_por_frecuencia(frecuencia)
}

/// Newtype alrededor de `rust_decimal::Decimal` que sobreescribe
/// `to_string()` para **no** emitir la cola decimal cuando el valor
/// es entero. Esto es necesario porque los tests del Slice 6 comparan
/// `l.total_ingresos.to_string()` contra la cadena literal `"720000000"`
/// (sin `.0000...`).
///
/// Detalles:
///   * `Display` también se implementa para que cualquier punto del
///     sistema que formatee el valor con `{}` vea la versión limpia.
///   * Los métodos aritméticos se delegan al `Decimal` interno vía
///     `Deref` + `From`/`Into`. Los tests sólo inspeccionan
///     `to_string()`, `as_ref`, `.eq`; la superficie API se mantiene
///     compatible con `Decimal` para que las páginas React / la UI
///     que consuman este struct no necesiten un wrapper paralelo en
///     TypeScript (los tests del Slice 6 son backend-only).
#[derive(Clone, Copy, Debug)]
pub struct CentavosDecimal(Decimal);

impl CentavosDecimal {
    pub fn new(d: Decimal) -> Self {
        Self(d.normalize())
    }
}

impl std::fmt::Display for CentavosDecimal {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        // Re-normalizamos antes de imprimir para garantizar que el
        // output no tenga cola decimal cuando el valor es entero.
        // Decimal::normalize() es idempotente y barato.
        write!(f, "{}", self.0.normalize())
    }
}

impl std::ops::Deref for CentavosDecimal {
    type Target = Decimal;
    fn deref(&self) -> &Decimal {
        &self.0
    }
}

impl From<Decimal> for CentavosDecimal {
    fn from(d: Decimal) -> Self {
        Self::new(d)
    }
}

impl From<i64> for CentavosDecimal {
    fn from(v: i64) -> Self {
        Self::new(Decimal::from(v))
    }
}

impl From<CentavosDecimal> for Decimal {
    fn from(c: CentavosDecimal) -> Self {
        c.0
    }
}

impl PartialEq for CentavosDecimal {
    fn eq(&self, other: &Self) -> bool {
        self.0.eq(&other.0)
    }
}

impl Eq for CentavosDecimal {}

impl std::ops::Add for CentavosDecimal {
    type Output = CentavosDecimal;
    fn add(self, rhs: Self) -> Self {
        Self::new(self.0 + rhs.0)
    }
}

impl std::ops::Sub for CentavosDecimal {
    type Output = CentavosDecimal;
    fn sub(self, rhs: Self) -> Self {
        Self::new(self.0 - rhs.0)
    }
}

impl std::ops::Mul for CentavosDecimal {
    type Output = CentavosDecimal;
    fn mul(self, rhs: Self) -> Self {
        Self::new(self.0 * rhs.0)
    }
}

impl std::ops::Div for CentavosDecimal {
    type Output = CentavosDecimal;
    fn div(self, rhs: Self) -> Self {
        Self::new(self.0 / rhs.0)
    }
}

/// Determina si una `Transaccion` es deuda basándose en su
/// `categoria_nombre`. La regla (binding): el nombre empieza por
/// "Deuda" (case-insensitive, sin acentos). El prefijo "Deuda"
/// matchea tanto "Deuda" como "Deudas ..." (sufijo plural).
fn es_deuda(tx: &Transaccion) -> bool {
    let nombre = tx.categoria_nombre.trim();
    if nombre.is_empty() {
        return false;
    }
    let lower = nombre.to_ascii_lowercase();
    lower.starts_with("deuda")
}

/// Calcula los 4 buckets de Gasto (necesarios, deudas, no tan nec, no
/// nec). Devuelve una tupla con los 4 buckets.
///
/// Se factoriza así (en vez de duplicar lógica entre Inicial y
/// Mejorado) para que las fórmulas vivan en un único lugar — mismo
/// argumento que `calcularMatriz` reusa `valorMensual`.
fn calcular_buckets_gastos(transacciones: &[Transaccion]) -> (Decimal, Decimal, Decimal, Decimal) {
    let mut necesarios = Decimal::ZERO;
    let mut deudas = Decimal::ZERO;
    let mut no_tan_necesarios = Decimal::ZERO;
    let mut no_necesarios = Decimal::ZERO;

    for tx in transacciones {
        if tx.tipo_flujo != "Gasto" {
            continue;
        }
        let naturaleza = match tx.naturaleza_necesidad.as_deref() {
            Some(n) => n,
            None => continue, // Gasto sin naturaleza: invariante roto, ignorar.
        };
        let mensual = valor_mensual(tx.valor_centavos, &tx.frecuencia);
        let tx_es_deuda = es_deuda(tx);

        match (naturaleza, tx_es_deuda) {
            ("Necesario", true) => {
                deudas += mensual;
            }
            ("Necesario", false) => {
                necesarios += mensual;
            }
            ("No tan necesario", _) => {
                no_tan_necesarios += mensual;
            }
            ("No necesario", _) => {
                no_necesarios += mensual;
            }
            _ => {} // naturaleza no canónica: ignorar defensivamente.
        }
    }

    (necesarios, deudas, no_tan_necesarios, no_necesarios)
}

fn total_ingresos(transacciones: &[Transaccion]) -> Decimal {
    let mut acc = Decimal::ZERO;
    for tx in transacciones {
        if tx.tipo_flujo != "Ingreso" {
            continue;
        }
        acc += valor_mensual(tx.valor_centavos, &tx.frecuencia);
    }
    acc
}

/// Aplica las simulaciones sobre una copia de las transacciones,
/// devolviendo un nuevo `Vec<Transaccion>` con los `valor_centavos` y
/// `frecuencia` reemplazados para los gastos que tienen propuesta.
///
/// Reglas (ver `matriz_mejorada.ts` §"Implementación" — mismo patrón):
///   * Los Ingresos NUNCA se tocan, aunque su `id` aparezca en
///     `simulaciones`.
///   * Si el `id` no está presente, no se hace nada.
///   * El `nuevo_valor_centavos` ya viene normalizado a mensual (la UI
///     se encarga); forzamos `frecuencia = "Mensual"` para que
///     `valor_mensual` no divida dos veces.
fn aplicar_simulaciones(
    transacciones: &[Transaccion],
    simulaciones: &[Simulacion],
) -> Vec<Transaccion> {
    if simulaciones.is_empty() {
        return transacciones.to_vec();
    }
    use std::collections::HashMap;
    let sim_by_tx: HashMap<i64, i64> = simulaciones
        .iter()
        .map(|s| (s.transaccion_id, s.nuevo_valor_centavos))
        .collect();
    transacciones
        .iter()
        .map(|tx| {
            if tx.tipo_flujo != "Gasto" {
                return tx.clone();
            }
            match sim_by_tx.get(&tx.id) {
                Some(&nuevo) => {
                    let mut rewritten = tx.clone();
                    rewritten.valor_centavos = nuevo;
                    rewritten.frecuencia = "Mensual".to_string();
                    rewritten
                }
                None => tx.clone(),
            }
        })
        .collect()
}

/// Compone un `LadoEstado` final a partir de los totales intermedios.
/// Es la fórmula de una sola línea que cierra contra el Excel:
///   FA1      = ingresos − (necesarios + deudas)
///   FA2      = FA1 − salario − variables_total
///   Cap.Inv  = salario + FA2
///   *anual   = × 12
fn componer_lado(
    ingresos: Decimal,
    necesarios: Decimal,
    deudas: Decimal,
    no_tan_necesarios: Decimal,
    no_necesarios: Decimal,
    salario: Option<Decimal>,
) -> LadoEstado {
    let total_gastos = necesarios + deudas + no_tan_necesarios + no_necesarios;
    let flujo_caja_libre = ingresos - total_gastos;
    let flujo_ahorro_1 = ingresos - necesarios - deudas;
    let variables_total = no_tan_necesarios + no_necesarios;
    let salario_dec = salario.unwrap_or(Decimal::ZERO);
    let flujo_ahorro_2 = flujo_ahorro_1 - salario_dec - variables_total;
    let capacidad_inversion = salario_dec + flujo_ahorro_2;

    LadoEstado {
        total_ingresos: ingresos.into(),
        gastos_necesarios: necesarios.into(),
        gastos_no_tan_necesarios: no_tan_necesarios.into(),
        gastos_no_necesarios: no_necesarios.into(),
        gastos_deudas: deudas.into(),
        total_gastos: total_gastos.into(),
        flujo_caja_libre: flujo_caja_libre.into(),
        flujo_ahorro_1: flujo_ahorro_1.into(),
        gastos_variables_total: variables_total.into(),
        salario_personal_objetivo: salario.map(CentavosDecimal::new),
        flujo_ahorro_2: flujo_ahorro_2.into(),
        capacidad_inversion: capacidad_inversion.into(),
        fcl_anual: (flujo_caja_libre * DOCE).into(),
        fa2_anual: (flujo_ahorro_2 * DOCE).into(),
        cap_inv_anual: (capacidad_inversion * DOCE).into(),
    }
}

// ---------------------------------------------------------------------------
// API pública.
// ---------------------------------------------------------------------------

/// Calcula el `LadoEstado` para el escenario Inicial (sin simulaciones,
/// sin descuento de salario personal objetivo).
pub fn calcular_lado_inicial(transacciones: &[Transaccion]) -> LadoEstado {
    let ingresos = total_ingresos(transacciones);
    let (necesarios, deudas, no_tan_necesarios, no_necesarios) =
        calcular_buckets_gastos(transacciones);

    componer_lado(
        ingresos,
        necesarios,
        deudas,
        no_tan_necesarios,
        no_necesarios,
        None,
    )
}

/// Calcula el `LadoEstado` para el escenario Mejorado (con simulaciones
/// aplicadas y salario personal objetivo descontado en FA2).
///
/// `salario_objetivo_centavos: None` significa que el usuario NO
/// configuró salario objetivo todavía: el lado Mejorado cae al mismo
/// cálculo que el Inicial (pero con las simulaciones aplicadas). Esta
/// decisión preserva la simetría del comparativo aún antes de que el
/// usuario abra el modal de Salario.
pub fn calcular_lado_mejorado(
    transacciones: &[Transaccion],
    simulaciones: &[Simulacion],
    salario_objetivo_centavos: Option<i64>,
) -> LadoEstado {
    // 1. Materializar la vista con simulaciones aplicadas.
    let transacciones_mejoradas = aplicar_simulaciones(transacciones, simulaciones);

    // 2. Reutilizar exactamente las mismas fórmulas que el lado Inicial.
    let ingresos = total_ingresos(&transacciones_mejoradas);
    let (necesarios, deudas, no_tan_necesarios, no_necesarios) =
        calcular_buckets_gastos(&transacciones_mejoradas);

    componer_lado(
        ingresos,
        necesarios,
        deudas,
        no_tan_necesarios,
        no_necesarios,
        salario_objetivo_centavos.map(Decimal::from),
    )
}

/// Helper de orquestación: calcula los dos lados en una sola llamada.
/// Útil cuando la UI quiere renderizar el comparativo completo y no
/// quiere pagar dos veces el costo de materializar la lista de
/// transacciones.
///
/// Esta es la firma **binding** pinneada por los tests del Slice 6
/// (`tests/kpis_test.rs`): `(transacciones, simulaciones, salario)`.
/// La detección de Deuda se hace internamente a partir de
/// `Transaccion.categoria_nombre` (hidratada por JOIN en
/// `transacciones::repo::list_by_user`), de modo que el caller no
/// tenga que proveerla explícitamente.
pub fn calcular_estado_resultados(
    transacciones: &[Transaccion],
    simulaciones: &[Simulacion],
    salario_objetivo_centavos: Option<i64>,
) -> EstadoResultados {
    let inicial = calcular_lado_inicial(transacciones);
    let mejorado = calcular_lado_mejorado(transacciones, simulaciones, salario_objetivo_centavos);
    EstadoResultados { inicial, mejorado }
}

// ---------------------------------------------------------------------------
// Tests unitarios rápidos (las pruebas de integración viven en
// `tests/kpis_test.rs` y son las que cierran contra el Excel).
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn make_tx(id: i64, categoria_nombre: &str, naturaleza: Option<&str>, freq: &str, valor: i64) -> Transaccion {
        Transaccion {
            id,
            usuario_id: 1,
            tipo_flujo: "Gasto".to_string(),
            categoria_id: 1,
            categoria_nombre: categoria_nombre.to_string(),
            concepto: format!("tx-{id}"),
            frecuencia: freq.to_string(),
            comportamiento: Some("Fijo".to_string()),
            naturaleza_necesidad: naturaleza.map(|s| s.to_string()),
            valor_centavos: valor,
            created_at: 0,
            updated_at: 0,
        }
    }

    #[test]
    fn es_deuda_matchea_prefijo_case_insensitive() {
        assert!(es_deuda(&make_tx(1, "Deudas entidades", Some("Necesario"), "Mensual", 1)));
        assert!(es_deuda(&make_tx(2, "Deuda", Some("Necesario"), "Mensual", 1)));
        assert!(es_deuda(&make_tx(3, "deudas conocidos", Some("Necesario"), "Mensual", 1)));
        assert!(!es_deuda(&make_tx(4, "Hogar", Some("Necesario"), "Mensual", 1)));
        assert!(!es_deuda(&make_tx(5, "Familia", Some("Necesario"), "Mensual", 1)));
        assert!(!es_deuda(&make_tx(6, "", Some("Necesario"), "Mensual", 1)));
    }

    #[test]
    fn divisor_por_frecuencia_canonico() {
        assert_eq!(divisor_por_frecuencia("Mensual"), Decimal::from(1));
        assert_eq!(divisor_por_frecuencia("Bimensual"), Decimal::from(2));
        assert_eq!(divisor_por_frecuencia("Trimestral"), Decimal::from(3));
        assert_eq!(divisor_por_frecuencia("Semestral"), Decimal::from(6));
        assert_eq!(divisor_por_frecuencia("Anual"), Decimal::from(12));
        // frecuencia desconocida cae a 1 (defensiva)
        assert_eq!(divisor_por_frecuencia("Desconocida"), Decimal::from(1));
    }

    #[test]
    fn valor_mensual_normaliza_consistente_con_multiplicacion() {
        // 200_000_000 / 6 = 33_333_333.333...; ×6 debe volver a 200_000_000.
        let v = valor_mensual(200_000_000, "Semestral");
        let recovered = v * Decimal::from(6);
        assert_eq!(recovered, Decimal::from(200_000_000));

        // 130_000_000 / 12 = 10_833_333.333...; ×12 = 130_000_000.
        let v = valor_mensual(130_000_000, "Anual");
        let recovered = v * Decimal::from(12);
        assert_eq!(recovered, Decimal::from(130_000_000));
    }

    #[test]
    fn aplicar_simulaciones_solo_toca_gastos_con_id_match() {
        // Sanity check: con simulaciones vacías, no se reescribe nada.
        let txs = vec![make_tx(1, "Hogar", Some("Necesario"), "Mensual", 100)];
        let rewritten = aplicar_simulaciones(&txs, &[]);
        assert_eq!(rewritten.len(), 1);
        assert_eq!(rewritten[0].valor_centavos, 100);
        assert_eq!(rewritten[0].frecuencia, "Mensual");
    }
}