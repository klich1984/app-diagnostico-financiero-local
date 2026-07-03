# Plan de Tests — Slice 4 (Fase RED)

> **Propósito**: documentar la fase RED de TDD para el slice 4 (HU-301 +
> HU-302) y dejar el fixture de tests listo para que la fase IMPL (delegada a
> un agente separado) solo tenga que escribir los módulos para que pasen.
>
> **Idioma**: español neutro (consistente con el resto de openspec).
>
> **Estado actual**: fase **RED**. Los tests fallan al compilar porque los
> módulos `src/domain/agregaciones/matriz.ts` y
> `src/domain/agregaciones/graficos.ts` aún no existen. Los tests del
> backend Rust pasan (son un contrato pin, no tests de implementación).
>
> Esta es la fase RED. La fase IMPL se delega en un agente separado. Los
> tests actualmente fallan al compilar.

---

## REQs cubiertos

| REQ       | Historia de usuario  | Alcance en este slice                                                                      |
| --------- | -------------------- | ------------------------------------------------------------------------------------------ |
| **REQ-301** | HU-301 (Presupuesto) | Matriz de agregación SUMIFS virtual. Totales por categoría × naturaleza. Flujo de Caja Libre. |
| **REQ-302** | HU-302 (Dashboard)   | Distribución porcentual para gráficos Recharts (torta + barras).                            |

Las dependencias de los REQs (REQ-202 transacciones, REQ-203 normalización,
REQ-603 multi-perfil) ya están testeadas y aprobadas en slices anteriores.

---

## Archivos de tests creados

| Archivo                                                       | Cantidad de tests | Módulo target                                                |
| ------------------------------------------------------------- | ----------------- | ------------------------------------------------------------ |
| `src-tauri/tests/transacciones_aggregate_test.rs`             | 3                 | `crate::transacciones::repo` (contrato — ya existe)          |
| `src/domain/agregaciones/__tests__/matriz.test.ts`            | 9                 | `src/domain/agregaciones/matriz.ts` (NO existe — T-302)      |
| `src/domain/agregaciones/__tests__/golden-mvp.test.ts`        | 4                 | `src/domain/agregaciones/matriz.ts` (golden, REQ-605)        |
| `src/domain/agregaciones/__tests__/graficos.test.ts`          | 5                 | `src/domain/agregaciones/graficos.ts` (NO existe — T-303)    |
| **Total**                                                     | **21 tests**      |                                                              |

> **Nota**: el test file `golden-mvp.test.ts` valida los mismos símbolos
> que `matriz.test.ts` (`calcularMatriz`), pero con el dataset de 32
> transacciones del Excel contra los valores de `docs/analisis-plantilla-financiera.md`.
> Se mantiene en archivo separado porque su costo de mantener (los datos)
> es independiente y porque el contrato "cierre al centavo contra Excel"
> merece su propio histórico.

---

## Detalle por test file

### 1. `transacciones_aggregate_test.rs` (Rust)

**Propósito**: pin del contrato Rust ↔ frontend. Como toda la agregación se
hace en TypeScript (ver `design.md` §1 regla "cálculo en el frontend"),
el backend solo tiene que garantizar que el shape devuelto por
`list_by_user` sea el que la capa TS espera.

| Test                                                     | Comportamiento esperado                                                                                    |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `req_301_repo_returns_all_transacciones_with_categoria_join` | El join in-memory entre `Transaccion.categoria_id` y `Categorias` recupera `tipo_flujo` y `nombre`.       |
| `req_301_repo_returns_ingresos_separated_from_gastos`    | Las filas retornadas por `list_by_user` pueden filtrarse en TS por `tipo_flujo` para cada bulto.         |
| `req_301_repo_includes_categoria_id_for_aggregation`     | `categoria_id` round-trippea sin mutación a través de `insert` + `list_by_user`.                            |

**Estado esperado al correr**: **PASA** (contrato pin; depende del módulo
`transacciones::repo` ya implementado en slice 3).

### 2. `matriz.test.ts` (TypeScript)

**Propósito**: validar `calcularMatriz` con fixtures sintéticos para cada
escenario del REQ-301 antes de enfrentar el dataset de 32 filas.

| Test                                              | Escenario validado                                                          |
| ------------------------------------------------- | --------------------------------------------------------------------------- |
| `req_301_matriz_agrega_ingresos_por_categoria`    | Dos ingresos en la misma categoría suman al `total` del bucket.            |
| `req_301_matriz_separa_fijo_de_variable`          | Ingreso Fijo e Ingreso Variable se separan correctamente.                  |
| `req_301_matriz_agrega_gastos_por_categoria`      | Dos gastos en la misma categoría suman al `total`.                         |
| `req_301_matriz_separa_necesidad_en_3_niveles`    | Necesario / No tan necesario / No necesario se separan.                     |
| `req_301_matriz_normaliza_frecuencia_a_mensual`   | Un gasto trimestral de $300K da $100K mensual (división exacta).            |
| `req_301_matriz_total_ingresos_mensual_es_correcto` | `totalIngresos` = suma de buckets de Ingreso.                            |
| `req_301_matriz_total_gastos_mensual_es_correcto`  | `totalGastos` = suma de buckets de Gasto.                                 |
| `req_301_matriz_flujo_caja_libre_ingresos_menos_gastos` | `flujoCajaLibre = totalIngresos − totalGastos`.                        |
| `req_301_matriz_anualizacion_es_x12_del_mensual`   | `totalIngresosAnual = totalIngresos × 12`.                                  |

**Estado esperado al correr**: **FALLA al import** — el módulo
`src/domain/agregaciones/matriz.ts` no existe todavía. Esto es la RED
esperada.

### 3. `golden-mvp.test.ts` (TypeScript)

**Propósito**: contrato más importante del slice. Reproduce las 32
transacciones del Excel y exige que las cifras cierren al centavo contra
`PRESUPUESTO!F12, F24, F27` y `J12`.

| Test                                                       | Valor esperado (centavos) | Celda Excel de referencia              |
| ---------------------------------------------------------- | ------------------------- | -------------------------------------- |
| `req_301_golden_total_ingresos_es_7_200_000`               | 720_000_000               | `PRESUPUESTO!F12`                      |
| `req_301_golden_total_gastos_es_8_345_000`                 | 834_500_000               | `PRESUPUESTO!F24`                      |
| `req_301_golden_flujo_caja_libre_inicial_es_negativo_1_145_000` | −114_500_000          | `PRESUPUESTO!F27`                      |
| `req_301_golden_anualizacion_ingresos_es_86_400_000`       | 8_640_000_000             | `PRESUPUESTO!J12 = 12 × 7.200.000`     |

**Estado esperado al correr**: **FALLA al import** (mismo módulo que
`matriz.test.ts`). Cuando el módulo sea creado, estos tests detectarán
cualquier drift de 1 centavo contra el Excel.

### 4. `graficos.test.ts` (TypeScript)

**Propósito**: validar `distribucionGastosPorCategoria` y
`distribucionIngresosPorCategoria` con fixtures sintéticos.

| Test                                                          | Escenario validado                                                                  |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `req_302_distribucion_gastos_categorias_con_porcentaje`       | 3 gastos en categorías distintas generan los porcentajes correctos.                 |
| `req_302_distribucion_porcentajes_suman_100`                  | N porcentajes suman 100 ±0.01 (tolerancia de redondeo).                             |
| `req_302_distribucion_ordenada_descendente`                   | Lista ordenada por `valor` DESC.                                                     |
| `req_302_distribucion_ignora_categorias_sin_transacciones`    | Categorías del catálogo sin transacciones NO aparecen en la distribución.           |
| `req_302_distribucion_usa_valores_normalizados_a_mensual`     | Trimestral de $300K → $100K mensual en el chart, no $300K.                          |

**Estado esperado al correr**: **FALLA al import** — el módulo
`src/domain/agregaciones/graficos.ts` no existe. RED esperada.

---

## Decisiones de pin (interfaces y firmas)

```ts
// src/domain/agregaciones/matriz.ts
export interface MatrizIngreso {
  categoria: string
  fijo: Decimal
  variable: Decimal
  total: Decimal
  totalAnual: Decimal
}

export interface MatrizGasto {
  categoria: string
  necesario: Decimal
  noTanNecesario: Decimal
  noNecesario: Decimal
  total: Decimal
  totalAnual: Decimal
}

export interface MatrizPresupuesto {
  ingresos: MatrizIngreso[]
  gastos: MatrizGasto[]
  totalIngresos: Decimal
  totalIngresosAnual: Decimal
  totalGastos: Decimal
  totalGastosAnual: Decimal
  flujoCajaLibre: Decimal
  flujoCajaLibreAnual: Decimal
}

export function calcularMatriz(
  transacciones: TransaccionMin[],
  categorias: CategoriaMin[],
): MatrizPresupuesto
```

```ts
// src/domain/agregaciones/graficos.ts
export interface DistribucionPorcentual {
  label: string
  valor: Decimal
  porcentaje: number  // 0..100, hasta 2 decimales
}

export function distribucionGastosPorCategoria(
  transacciones: TransaccionMin[],
  categorias: CategoriaMin[],
): DistribucionPorcentual[]

export function distribucionIngresosPorCategoria(
  transacciones: TransaccionMin[],
  categorias: CategoriaMin[],
): DistribucionPorcentual[]
```

```ts
// tipos exportados del módulo de matriz (también reusados por graficos)
export interface TransaccionMin {
  tipo_flujo: 'Ingreso' | 'Gasto'
  categoria_id: number
  frecuencia: Frecuencia
  comportamiento?: 'Fijo' | 'Variable'
  naturaleza_necesidad?: 'Necesario' | 'No tan necesario' | 'No necesario'
  valor_centavos: number
}

export interface CategoriaMin {
  id: number
  nombre: string
  grupo_pertenencia: 'INGRESO' | 'GASTO'
}
```

> **Nota**: `grupo_pertenencia` es el alias de TS para la columna SQL
> `Categorias.tipo_flujo`. La capa TS hace esa traducción al cargar las
> categorías. Es parte del contrato fijo-pin de los tests.

---

## Comandos para verificar la RED

Desde la raíz del proyecto:

```bash
# TypeScript — debe fallar con "Failed to resolve import '..'" en los 3
# archivos de slice 4.
pnpm test 2>&1 | tail -10

# Rust — debe compilar; el aggregate_test pasa porque es solo un pin
# de contrato (los módulos target ya existen).
cd src-tauri && cargo test --test transacciones_aggregate_test 2>&1 | tail -10
```

Resultado esperado:

- **pnpm test**: `Test Files 3 failed | 5 passed (8)` — los 3 nuevos files
  fallan al import; los 5 previos pasan.
- **cargo test --test transacciones_aggregate_test**: `3 passed; 0 failed`.

---

## Acceptance criteria para fase IMPL

La fase IMPL (siguiente agente) debe:

1. Crear `src/domain/agregaciones/matriz.ts` exportando
   `calcularMatriz`, las tres interfaces (`MatrizIngreso`, `MatrizGasto`,
   `MatrizPresupuesto`), y los dos tipos de entrada (`TransaccionMin`,
   `CategoriaMin`).
2. Crear `src/domain/agregaciones/graficos.ts` exportando
   `distribucionGastosPorCategoria`, `distribucionIngresosPorCategoria`
   y la interfaz `DistribucionPorcentual`. Debe reusar `valorMensual` /
   `valorAnual` de `domain/normalizacion` para la normalización (no
   reimplementar el divisor).
3. Toda la aritmética monetaria va por `Decimal` (no `Number`).
4. Después del IMPL, los 21 tests de slice 4 deben pasar en verde
   (`pnpm test` → todos los files pasan; golden tests con cierre al
   centavo).

---

## Riesgos identificados

- **Precisión decimal**: la división 350_000_000 / 3 produce un decimal
  periódico. El módulo `domain/precision/money.ts` configura
  `precision: 32` + `ROUND_HALF_EVEN` justamente para evitar drift. Si
  el IMPL importa `Decimal` desde otro lugar o cambia la config, los
  golden tests fallarán.
- **Categorias con valor cero**: si el IMPL incluye filas con `total=0`
  en la distribución porcentual, se generaría un `0/0 = NaN`. El test
  `ignora_categorias_sin_transacciones` exige filtrarlas; el IMPL debe
  hacer ese check antes de dividir.
- **Orden de buckets**: el REQ-302 no exige un ordenamiento estricto,
  pero el test `distribucion_ordenada_descendente` lo fija DESC por
  `valor`. Si el IMPL usa otro orden, ese test fallará y debe
  corregirse explícitamente.
