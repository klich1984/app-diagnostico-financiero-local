# Plan de Tests — Slice 6 (Fase RED)

> **Propósito**: documentar la fase RED de TDD para el slice 6
> (Épica 5: HU-501, HU-502 + REQ-605 — Estado de Resultados,
> Salario Personal Objetivo y Cierre al centavo contra Excel) y
> dejar los tests listos para que la fase IMPL (delegada a un
> agente separado) solo tenga que escribir los módulos para que
> pasen.
>
> **Idioma**: español neutro (consistente con el resto de openspec).
>
> **Estado actual**: fase **RED**. Los tests fallan al compilar
> porque los módulos target (`src-tauri/src/kpis.rs`,
> `src/domain/kpis/index.ts`) aún no existen.
>
> Esta es la fase RED. La fase IMPL se delega en un agente separado.
> Los tests actualmente fallan al compilar.
>
> **Alcance del slice (decisión del usuario)**: solo lógica +
> golden tests. **NO** incluye UI (los componentes React de
> `EstadoResultadosDual` y `SalarioModal` se delegan a un slice
> futuro si el usuario lo aprueba).

---

## REQs cubiertos

| REQ       | Historia de usuario  | Alcance en este slice                                                                                          |
| --------- | -------------------- | -------------------------------------------------------------------------------------------------------------- |
| **REQ-501** | HU-501 (Estado de Resultados) | Motor de cálculo `calcular_estado_resultados` que produce la vista dual Inicial vs Mejorado.            |
| **REQ-502** | HU-502 (Salario Objetivo)     | El salario objetivo es un input del motor (no se persiste en el resultado Inicial).                  |
| **REQ-605** | Cierre al centavo             | 6 golden tests que validan los KPIs contra las celdas reales del Excel (`D4`, `D14`, `D21`, `H23`, `E13`). |

Las dependencias (REQ-301 matriz, REQ-403 presupuesto mejorado,
REQ-603 multi-perfil, REQ-203 normalización temporal) ya están
testeadas y aprobadas en slices anteriores.

---

## Archivos de tests creados

| Archivo                                              | Cantidad de tests | Módulo target                                              |
| ---------------------------------------------------- | ----------------- | ---------------------------------------------------------- |
| `src-tauri/tests/kpis_test.rs`                       | 10                | `crate::kpis` (NO existe — T-503 backend)                   |
| `src/domain/kpis/__tests__/index.test.ts`            | 11                | `src/domain/kpis/index.ts` (NO existe — T-503 frontend)    |
| `src/domain/kpis/__tests__/golden-excel.test.ts`     | 6                 | `src/domain/kpis/index.ts` (NO existe — T-X01 golden)      |
| **Total**                                            | **27 tests**      |                                                            |

---

## Detalle por test file

### 1. `kpis_test.rs` (Rust)

**Propósito**: pin del contrato backend del motor de KPIs.
Cubre el cálculo de los 4 KPIs terminales (FA1, FA2,
Cap.Inv) en ambos lados (Inicial y Mejorado), la anualización
`× 12` y la configuración del salario objetivo.

| Test                                                | Escenario validado                                                                                  |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `req_501_kpis_inicial_total_ingresos_es_7_200_000`  | 32 transacciones → `inicial.total_ingresos = 720_000_000` centavos (match `PRESUPUESTO!F12`).       |
| `req_501_kpis_inicial_fa1_es_2_140_000`            | `inicial.flujo_ahorro_1 = 214_000_000` centavos (match `ESTADO DE RESULTADOS!D14`).                 |
| `req_501_kpis_inicial_fa2_es_neg_1_145_000`         | `inicial.flujo_ahorro_2 = -114_500_000` centavos (match `ESTADO DE RESULTADOS!D21`).                |
| `req_501_kpis_inicial_cap_inv_es_neg_1_145_000`     | `inicial.capacidad_inversion = -114_500_000` centavos (= FA2 cuando `salario = None`).              |
| `req_501_kpis_mejorado_fa1_es_2_140_000`            | `mejorado.flujo_ahorro_1 = 214_000_000` (igual al Inicial; Necesarios + Deudas no se simulan).      |
| `req_501_kpis_mejorado_fa2_es_425_000`              | `mejorado.flujo_ahorro_2 = 42_500_000` centavos (match `ESTADO DE RESULTADOS!H21`).                 |
| `req_501_kpis_mejorado_cap_inv_es_925_000`          | `mejorado.capacidad_inversion = 92_500_000` centavos (match `ESTADO DE RESULTADOS!H23`).            |
| `req_501_kpis_mejorado_total_gastos_se_reduce`      | `mejorado.total_gastos = 627_500_000`; `inicial − mejorado = 207_000_000` (match `OPORTUNIDADES!C13`). |
| `req_502_kpis_salario_default_es_500_000`           | Salario `$500,000 = 50_000_000` centavos se refleja en `mejorado.salario_personal_objetivo`.         |
| `req_501_kpis_anualizacion_es_x12_fcl`              | `fcl_anual = flujo_caja_libre × 12` exacto (match `PRESUPUESTO!J27` y `PRESUPUESTO MEJORADO!L25×12`). |

**Estado esperado al correr**: **FALLA al compilar** — el módulo
`src-tauri/src/kpis.rs` no existe todavía (y `pub mod kpis;` no
está declarado en `lib.rs`). RED confirmada vía
`cargo test --no-run --test kpis_test` →
`error[E0432]: unresolved import 'kpis'`.

### 2. `index.test.ts` (TypeScript — API granular)

**Propósito**: contrato público del motor de KPIs en TS. Cubre
la misma lógica que `kpis_test.rs` pero desde el lado del
frontend, y exporta además dos funciones granulares
(`calcularLadoInicial` y `calcularLadoMejorado`) que la UI
puede consumir sin pagar el costo de calcular ambos lados.

| Test                                              | Escenario validado                                                                  |
| ------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `req_501_kpis_inicial_total_ingresos_es_7_200_000` | Igual al Rust counterpart.                                                          |
| `req_501_kpis_inicial_fa1_es_2_140_000`           | Igual al Rust counterpart.                                                          |
| `req_501_kpis_inicial_fa2_es_neg_1_145_000`       | Igual al Rust counterpart.                                                          |
| `req_501_kpis_inicial_cap_inv_es_neg_1_145_000`   | Igual al Rust counterpart.                                                          |
| `req_501_kpis_mejorado_fa1_es_2_140_000`          | Igual al Rust counterpart.                                                          |
| `req_501_kpis_mejorado_fa2_es_425_000`            | Igual al Rust counterpart.                                                          |
| `req_501_kpis_mejorado_cap_inv_es_925_000`        | Igual al Rust counterpart.                                                          |
| `req_501_kpis_mejorado_total_gastos_es_6_275_000`  | `mejorado.total_gastos = 627_500_000` centavos (match `PRESUPUESTO MEJORADO!L23`).   |
| `req_501_kpis_anualizacion_es_x12`                | `fcl_anual`, `fa2_anual`, `cap_inv_anual` cumplen exactamente `× 12`.                |
| `req_501_calcularLadoInicial_retorna_solo_inicial` | La función granular del Inicial retorna solo `LadoEstado` (no `EstadoResultados`).  |
| `req_501_calcularLadoMejorado_aplica_simulaciones_y_salario` | La función granular del Mejorado aplica simulaciones + salario correctamente. |

**Estado esperado al correr**: **FALLA al import** — el módulo
`src/domain/kpis/index.ts` no existe todavía. RED confirmada vía
`pnpm test` → `Failed to resolve import ".."`.

### 3. `golden-excel.test.ts` (TypeScript — contrato REQ-605)

**Propósito**: el **único test más importante del proyecto**.
Pinea cada KPI contra la celda exacta del Excel fuente. Si el
IMPL o cualquier cambio futuro rompe la garantía de cierre al
centavo, este archivo falla primero.

| Test                                                | Celda del Excel                                                              |
| --------------------------------------------------- | ---------------------------------------------------------------------------- |
| `req_605_golden_32_filas_ingresos_7_200_000`        | `PRESUPUESTO!F12` y `ESTADO DE RESULTADOS!D4` (también H4).                  |
| `req_605_golden_32_filas_total_gastos_inicial_8_345_000` | `PRESUPUESTO!F24` + split de gastos_deudas, gastos_necesarios, etc.   |
| `req_605_golden_32_filas_fa1_2_140_000`             | `ESTADO DE RESULTADOS!D14 = H14`.                                            |
| `req_605_golden_32_filas_fa2_inicial_neg_1_145_000` | `ESTADO DE RESULTADOS!D21`.                                                  |
| `req_605_golden_32_filas_cap_inv_mejorada_925_000`  | `ESTADO DE RESULTADOS!H23` (también `PRESUPUESTO MEJORADO!L25`).             |
| `req_605_golden_32_filas_ahorro_anual_24_840_000`   | `OPORTUNIDADES DE MEJORA!E13`.                                               |

**Estado esperado al correr**: **FALLA al import** — el módulo
`src/domain/kpis/index.ts` no existe todavía. RED confirmada vía
`pnpm test`.

---

## Valores dorados (golden values) bloqueados

| KPI                          | Valor Excel                | Centavos       | Source cell                              |
| ---------------------------- | -------------------------- | -------------- | ---------------------------------------- |
| `inicial.total_ingresos`     | $7,200,000.00              | 720_000_000    | `PRESUPUESTO!F12`, `ESTADO DE RESULTADOS!D4` |
| `inicial.gastos_necesarios` (sin deudas) | $3,860,000.00  | 386_000_000    | Excel §3.4 "Gastos fijos necesarios" + Provisiones |
| `inicial.gastos_deudas`      | $1,200,000.00              | 120_000_000    | `PRESUPUESTO!F18` (Deudas entidades)     |
| `inicial.gastos_no_tan_necesarios` | $1,665,000.00       | 166_500_000    | `PRESUPUESTO!D24`                        |
| `inicial.gastos_no_necesarios` | $1,620,000.00            | 162_000_000    | `PRESUPUESTO!E24`                        |
| `inicial.total_gastos`       | $8,345,000.00              | 834_500_000    | `PRESUPUESTO!F24`                        |
| `inicial.flujo_ahorro_1`     | $2,140,000.00              | 214_000_000    | `ESTADO DE RESULTADOS!D14`               |
| `inicial.flujo_ahorro_2`     | -$1,145,000.00             | -114_500_000   | `ESTADO DE RESULTADOS!D21`               |
| `inicial.capacidad_inversion` | -$1,145,000.00            | -114_500_000   | `ESTADO DE RESULTADOS!D23`               |
| `mejorado.flujo_ahorro_1`    | $2,140,000.00              | 214_000_000    | `ESTADO DE RESULTADOS!H14`               |
| `mejorado.flujo_ahorro_2`    | $425,000.00                | 42_500_000     | `ESTADO DE RESULTADOS!H21`               |
| `mejorado.capacidad_inversion` | $925,000.00              | 92_500_000     | `ESTADO DE RESULTADOS!H23`, `PRESUPUESTO MEJORADO!L25` |
| `mejorado.total_gastos`      | $6,275,000.00              | 627_500_000    | `PRESUPUESTO MEJORADO!L23`               |
| `inicial.fcl_anual`          | -$13,740,000.00            | -1_374_000_000 | `PRESUPUESTO!J27`                        |
| `mejorado.cap_inv_anual`     | $11,100,000.00             | 1_110_000_000  | `PRESUPUESTO MEJORADO!L25 × 12`          |
| **Ahorro anual total**       | **$24,840,000.00**         | **2_484_000_000** | **`OPORTUNIDADES DE MEJORA!E13`** (golden único de REQ-605) |

---

## Decisiones de pin (interfaces y firmas)

```rust
// src-tauri/src/kpis.rs
pub struct LadoEstado {
    pub total_ingresos: Decimal,
    pub gastos_necesarios: Decimal,
    pub gastos_no_tan_necesarios: Decimal,
    pub gastos_no_necesarios: Decimal,
    pub gastos_deudas: Decimal,
    pub total_gastos: Decimal,
    pub flujo_caja_libre: Decimal,
    pub flujo_ahorro_1: Decimal,
    pub gastos_variables_total: Decimal,
    pub salario_personal_objetivo: Option<Decimal>,
    pub flujo_ahorro_2: Decimal,
    pub capacidad_inversion: Decimal,
    pub fcl_anual: Decimal,
    pub fa2_anual: Decimal,
    pub cap_inv_anual: Decimal,
}

pub struct EstadoResultados {
    pub inicial: LadoEstado,
    pub mejorado: LadoEstado,
}

pub fn calcular_estado_resultados(
    transacciones: &[Transaccion],
    simulaciones: &[Simulacion],
    salario_objetivo_centavos: Option<i64>,
) -> EstadoResultados
```

```ts
// src/domain/kpis/index.ts
export interface LadoEstado { /* mismo shape que el Rust, Decimal en vez de rust_decimal */ }
export interface EstadoResultados {
  inicial: LadoEstado
  mejorado: LadoEstado
}

export function calcularEstadoResultados(
  transacciones: Array<TransaccionMin & { id: number }>,
  categorias: CategoriaMin[],
  simulaciones: Simulacion[],
  salarioObjetivoCentavos: number | null,
): { inicial: LadoEstado; mejorado: LadoEstado }

export function calcularLadoInicial(
  transacciones: Array<TransaccionMin & { id: number }>,
  categorias: CategoriaMin[],
): LadoEstado

export function calcularLadoMejorado(
  transacciones: Array<TransaccionMin & { id: number }>,
  categorias: CategoriaMin[],
  simulaciones: Simulacion[],
  salarioObjetivoCentavos: number | null,
): LadoEstado
```

---

## Comandos para verificar la RED

Desde la raíz del proyecto:

```bash
# Rust — debe fallar con "unresolved import `kpis`".
"C:\Users\hetan\.cargo\bin\cargo.exe" test --no-run --test kpis_test \
  --manifest-path src-tauri/Cargo.toml 2>&1 | tail -10

# TypeScript — debe fallar con "Failed to resolve import '..'" en los
# 2 archivos nuevos del slice 6 (index.test.ts y golden-excel.test.ts).
pnpm test --run 2>&1 | tail -10
```

Resultado esperado:

- **cargo test --no-run --test kpis_test**:
  `error[E0432]: unresolved import 'kpis'`.
- **pnpm test**: `Test Files 2 failed | 11 passed (13)` — los 2 nuevos
  files fallan al import; los 11 previos (incluyendo slice-5 golden
  tests) pasan.

---

## Acceptance criteria para fase IMPL

La fase IMPL (siguiente agente) debe:

1. Crear `src-tauri/src/kpis.rs` exportando `LadoEstado`,
   `EstadoResultados` y `calcular_estado_resultados`. Agregar
   `pub mod kpis;` a `src-tauri/src/lib.rs`. La aritmética va por
   `rust_decimal::Decimal` (agregar `rust_decimal = "1"` a
   `src-tauri/Cargo.toml`).
2. Crear `src/domain/kpis/index.ts` exportando `LadoEstado`,
   `EstadoResultados`, `calcularEstadoResultados`,
   `calcularLadoInicial` y `calcularLadoMejorado`.
3. La función debe reutilizar `calcularMatriz` (slice 4) y
   `calcularMatrizMejorada` (slice 5) para mantener **una sola
   fuente de verdad** del cálculo de gastos. Los KPIs son una
   capa de agregación y anuales encima de las matrices.
4. La detección de "deuda" se hace por nombre de categoria
   (case-insensitive, empieza con "Deuda" o "Deudas"). El fixture
   tiene exactamente una categoria así (`Deudas entidades`) con
   un gasto (`Credito carro` $120,000).
5. Después del IMPL, los 27 tests del slice 6 deben pasar en
   verde: los 6 golden tests con cierre al centavo contra el
   Excel.

---

## Riesgos identificados

- **`cargo` no está en PATH en Windows**: usar
  `C:\Users\hetan\.cargo\bin\cargo.exe` o agregar `~/.cargo/bin`
  al PATH antes de verificar la RED.
- **Aritmética Decimal en Rust**: el backend debe usar
  `rust_decimal::Decimal` (NO `f64` ni `i64`) para que las
  divisiones como `350_000_000/3` no generen drift. La decisión
  de usar `Decimal` en Rust es coherente con el frontend (que
  usa `decimal.js`); sin embargo, hay que agregar la dependencia
  en `src-tauri/Cargo.toml` durante el IMPL.
- **Categorización de deudas**: el prompt instruye que un gasto
  es "deuda" cuando su categoria empieza con "Deuda" o
  "Deudas". El IMPL debe validar que el fixture (que tiene una
  sola categoria así) produce `gastos_deudas = 120_000_000`
  centavos y `gastos_necesarios (sin deudas) = 386_000_000`
  centavos.
- **`calcularLadoInicial` con `simulaciones`**: la firma
  propuesta en el prompt omite las simulaciones del lado
  Inicial. Si el IMPL decide aceptar `simulaciones` también
  acá (para mantener simetría), debe ignorarlas en el cálculo
  Inicial (el Inicial NO aplica simulaciones, es snapshot del
  estado actual).
- **El salario default del usuario**: el prompt fija el salario
  default del usuario seed (`Yo`) en `$500,000 = 50_000_000`
  centavos. El IMPL del lado backend debe garantizar que
  `fresh_db_with_default_user` (test helper) cree el usuario
  con ese salario. El TS side no toca DB, así que el salario se
  pasa explícitamente al motor.

---

Esta es la fase RED. La fase IMPL se delega en un agente separado.