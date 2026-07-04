// MVP Financiero - motor de cálculo del Estado de Resultados dual
// (REQ-501 + REQ-502 + REQ-605).
//
// Ver `openspec/changes/mvp-financiero-local-first/spec.md` §REQ-501
// (vista dual Inicial vs Mejorado) + §REQ-502 (Salario Personal
// Objetivo configurable) + §REQ-605 (cierre al centavo contra Excel)
// y `design.md` §9.1 (motor de cálculo de KPIs) + §10 (Panel
// Simulador) + §17 (reglas de redondeo R-NUEVO-*).
//
// Este módulo es la capa que cierra contra el Excel fuente: cada
// `Decimal` retornado está en centavos y la división / multiplicación
// por 12 está libre de drift de IEEE-754 (gracias a la configuración
// `precision: 32` + `ROUND_HALF_EVEN` de `domain/precision/money.ts`).
//
// ## Decisiones de diseño (binding con el Excel)
//
//   * **Detección de Deuda por nombre de categoria**: una transacción
//     es "deuda" si el `nombre` de su categoria empieza por "Deuda"
//     (case-insensitive, sin acentos). El Excel fuente tiene dos
//     categorias semilla que matchean ese prefijo: `Deudas entidades`
//     y `Deudas conocidos`. Esta regla se codifica una sola vez en
//     `esCategoriaDeudaPorNombre` (exportada para tests/debug).
//
//   * **Reuso de `calcularMatriz` y `calcularMatrizMejorada`**: el
//     motor NO re-implementa la agregación por categoria × naturaleza.
//     Compone su resultado sobre los totales ya normalizados de la
//     matriz, de modo que los KPIs nunca puedan divergir del Excel
//     por una diferencia de redondeo entre dos caminos.
//
//   * **Salario NO se descuenta en el lado Inicial** (decisión
//     bloqueada #2): el campo `LadoEstado.salario_personal_objetivo`
//     siempre es `null` en `inicial`, y `null` se trata como 0 en
//     las fórmulas.
//
//   * **Lado Mejorado aplica simulaciones y descuenta salario**:
//     los gastos cuyo `id` aparece en `simulaciones` ven su
//     `valor_centavos` reemplazado por el propuesto, y se descuenta
//     `salarioObjetivoCentavos` del FA2 (ver `matriz_mejorada.ts`
//     para el detalle del materializado).
//
// ## Golden Excel (referencia)
//
// Para el fixture de 32 transacciones del Excel fuente:
//   * `inicial.total_ingresos`  = $7,200,000  → 720_000_000 centavos
//   * `inicial.total_gastos`    = $8,345,000  → 834_500_000 centavos
//   * `inicial.flujo_ahorro_1`  = $2,140,000  → 214_000_000 centavos
//   * `inicial.flujo_ahorro_2`  = -$1,145,000 → -114_500_000 centavos
//   * `mejorado.total_gastos`   = $6,275,000  → 627_500_000 centavos
//   * `mejorado.flujo_ahorro_2` = $425,000    → 42_500_000 centavos
//   * `mejorado.capacidad_inversion` = $925,000 → 92_500_000 centavos

import { Decimal } from '../precision/money'
import {
  calcularMatriz,
  type CategoriaMin,
  type MatrizPresupuesto,
  type TransaccionMin,
} from '../agregaciones'
import { calcularMatrizMejorada, type Simulacion } from '../simulador/matriz-mejorada'

// ---------------------------------------------------------------------------
// Tipos públicos.
// ---------------------------------------------------------------------------

/**
 * Resultado del cálculo para un lado del comparativo (Inicial o
 * Mejorado). Todos los montos están en centavos y son `Decimal`
 * (configurado a 32 dígitos + ROUND_HALF_EVEN en
 * `domain/precision/money.ts`) para evitar drift de IEEE-754.
 *
 * `salario_personal_objetivo` es `null` en el lado Inicial (decisión
 * bloqueada #2) y `Decimal(500_000_000)` (u otro valor que el usuario
 * haya tipeado en el modal) en el lado Mejorado.
 */
export interface LadoEstado {
  total_ingresos: Decimal
  gastos_necesarios: Decimal
  gastos_no_tan_necesarios: Decimal
  gastos_no_necesarios: Decimal
  gastos_deudas: Decimal
  total_gastos: Decimal
  flujo_caja_libre: Decimal
  flujo_ahorro_1: Decimal
  gastos_variables_total: Decimal
  salario_personal_objetivo: Decimal | null
  flujo_ahorro_2: Decimal
  capacidad_inversion: Decimal
  fcl_anual: Decimal
  fa2_anual: Decimal
  cap_inv_anual: Decimal
}

/** Estado de Resultados dual: un lado por cada escenario del MVP. */
export interface EstadoResultados {
  inicial: LadoEstado
  mejorado: LadoEstado
}

// ---------------------------------------------------------------------------
// Helpers de detección.
// ---------------------------------------------------------------------------

/**
 * Predicado canónico de "es categoria Deuda". El Excel fuente separa
 * los gastos `Necesario` en `Fijos` vs `Deudas` vía el nombre de la
 * categoria: cualquier nombre que empiece por "Deuda" (case-insensitive,
 * tolerante a singular/plural: `Deuda` o `Deudas ...`) se considera
 * Deuda. Exportada para que los tests y la UI puedan compartir la
 * misma regla.
 */
export function esCategoriaDeudaPorNombre(nombre: string): boolean {
  const trimmed = nombre.trim()
  if (trimmed.length === 0) return false
  return trimmed.toLowerCase().startsWith('deuda')
}

/**
 * Devuelve el subconjunto del catálogo de categorias que matchea el
 * predicado "Deuda". El resultado se usa como set de búsqueda O(1) en
 * el bucle de gastos.
 */
export function categoriasDeuda(
  categorias: CategoriaMin[],
): Set<number> {
  const set = new Set<number>()
  for (const c of categorias) {
    if (esCategoriaDeudaPorNombre(c.nombre)) {
      set.add(c.id)
    }
  }
  return set
}

// ---------------------------------------------------------------------------
// Helpers de cálculo reutilizables.
// ---------------------------------------------------------------------------

const DOCE = new Decimal(12)
const CERO = new Decimal(0)

/**
 * Suma los `gastos_deudas` de la matriz: el total del bucket
 * `Deudas entidades` + `Deudas conocidos` (las dos categorias
 * semilla que matchean el prefijo "Deuda").
 *
 * El motor de matriz (`calcularMatriz`) ya normalizó cada fila a su
 * equivalente mensual, así que la suma de los totales por categoria
 * da directamente el KPI en centavos/mes.
 */
function sumarDeudas(
  matriz: MatrizPresupuesto,
  deudaIds: Set<number>,
  categorias: CategoriaMin[],
): Decimal {
  let acc = CERO
  for (const g of matriz.gastos) {
    const cat = categorias.find((c) => c.nombre === g.categoria)
    if (cat && deudaIds.has(cat.id)) {
      acc = acc.plus(g.total)
    }
  }
  return acc
}

/**
 * Compone un `LadoEstado` a partir de la matriz base/mejorada y el
 * resto de inputs. Esta es la única función que conoce las fórmulas
 * (FA1, FA2, Cap.Inv, anualización) — `calcularLadoInicial` y
 * `calcularLadoMejorado` la delegan con sólo cambiar la `matriz` y el
 * `salario`.
 */
function componerLado(
  matriz: MatrizPresupuesto,
  categorias: CategoriaMin[],
  deudaIds: Set<number>,
  salario: Decimal | null,
): LadoEstado {
  const gastosDeudas = sumarDeudas(matriz, deudaIds, categorias)

  // gastos_necesarios (excluyendo deudas) = totalNecesario − deudas.
  // Sumamos los 10 buckets de Gasto cuyo naturaleza='Necesario' pero
  // filtrando las categorias Deuda. Para mantener la implementación
  // simple y exacta, volvemos a iterar la matriz y excluimos las
  // categorias Deuda.
  let gastosNecesarios = CERO
  let gastosNoTanNec = CERO
  let gastosNoNec = CERO
  for (const g of matriz.gastos) {
    const cat = categorias.find((c) => c.nombre === g.categoria)
    const esDeuda = cat ? deudaIds.has(cat.id) : false
    if (esDeuda) continue // ya cubierto por `gastosDeudas`
    gastosNecesarios = gastosNecesarios.plus(g.necesario)
    gastosNoTanNec = gastosNoTanNec.plus(g.noTanNecesario)
    gastosNoNec = gastosNoNec.plus(g.noNecesario)
  }

  const totalGastos = matriz.totalGastos
  const ingresos = matriz.totalIngresos

  // FA1 = ingresos − (Necesarios + Deudas). El Excel separa
  // "Gastos fijos necesarios" y "Provisiones" para llegar al mismo
  // número desde otra vía; nosotros vamos por la vía agregada.
  const flujoAhorro1 = ingresos.minus(gastosNecesarios).minus(gastosDeudas)
  // FCL = ingresos − total_gastos. Equivale al
  // `matriz.flujoCajaLibre` ya calculado, pero lo recomponemos para
  // que el contrato del KPI quede en un solo lugar.
  const flujoCajaLibre = ingresos.minus(totalGastos)

  const variablesTotal = gastosNoTanNec.plus(gastosNoNec)
  const salarioDec = salario ?? CERO
  // FA2 = FA1 − salario − variables_total.
  const flujoAhorro2 = flujoAhorro1.minus(salarioDec).minus(variablesTotal)
  // Cap.Inv = salario + FA2. Si salario es null, cae a FA2.
  const capacidadInversion = salarioDec.plus(flujoAhorro2)

  return {
    total_ingresos: ingresos,
    gastos_necesarios: gastosNecesarios,
    gastos_no_tan_necesarios: gastosNoTanNec,
    gastos_no_necesarios: gastosNoNec,
    gastos_deudas: gastosDeudas,
    total_gastos: totalGastos,
    flujo_caja_libre: flujoCajaLibre,
    flujo_ahorro_1: flujoAhorro1,
    gastos_variables_total: variablesTotal,
    salario_personal_objetivo: salario,
    flujo_ahorro_2: flujoAhorro2,
    capacidad_inversion: capacidadInversion,
    fcl_anual: flujoCajaLibre.mul(DOCE),
    fa2_anual: flujoAhorro2.mul(DOCE),
    cap_inv_anual: capacidadInversion.mul(DOCE),
  }
}

// ---------------------------------------------------------------------------
// API pública.
// ---------------------------------------------------------------------------

/**
 * Calcula el `LadoEstado` para el escenario Inicial (sin
 * simulaciones, sin descuento de salario personal objetivo).
 *
 * Esta función se exporta para que la UI pueda renderizar solo el lado
 * Inicial (e.g. cuando el Panel Simulador está cerrado) sin pagar el
 * costo de calcular también el lado Mejorado.
 */
export function calcularLadoInicial(
  transacciones: Array<TransaccionMin & { id: number }>,
  categorias: CategoriaMin[],
): LadoEstado {
  const deudaIds = categoriasDeuda(categorias)
  const matriz = calcularMatriz(transacciones, categorias)
  return componerLado(matriz, categorias, deudaIds, null)
}

/**
 * Calcula el `LadoEstado` para el escenario Mejorado (con
 * simulaciones aplicadas y salario personal objetivo descontado en
 * FA2).
 *
 * `salarioObjetivoCentavos: null` significa que el usuario NO
 * configuró salario objetivo todavía: el lado Mejorado cae al mismo
 * cálculo que el Inicial (pero con las simulaciones aplicadas). Esta
 * decisión preserva la simetría del comparativo aún antes de que el
 * usuario abra el modal de Salario.
 */
export function calcularLadoMejorado(
  transacciones: Array<TransaccionMin & { id: number }>,
  categorias: CategoriaMin[],
  simulaciones: Simulacion[],
  salarioObjetivoCentavos: number | null,
): LadoEstado {
  const deudaIds = categoriasDeuda(categorias)
  const matriz = calcularMatrizMejorada(transacciones, categorias, simulaciones)
  const salario = salarioObjetivoCentavos === null
    ? null
    : new Decimal(salarioObjetivoCentavos)
  return componerLado(matriz, categorias, deudaIds, salario)
}

/**
 * Helper de orquestación: calcula los dos lados en una sola llamada.
 * Útil cuando la UI quiere renderizar el comparativo completo y no
 * quiere pagar dos veces el costo de iterar las transacciones.
 *
 * Esta es la firma **binding** pinneada por los tests del Slice 6
 * (`src/domain/kpis/__tests__/index.test.ts` y `golden-excel.test.ts`):
 * `(transacciones, categorias, simulaciones, salarioObjetivoCentavos)`.
 */
export function calcularEstadoResultados(
  transacciones: Array<TransaccionMin & { id: number }>,
  categorias: CategoriaMin[],
  simulaciones: Simulacion[],
  salarioObjetivoCentavos: number | null,
): EstadoResultados {
  const inicial = calcularLadoInicial(transacciones, categorias)
  const mejorado = calcularLadoMejorado(
    transacciones,
    categorias,
    simulaciones,
    salarioObjetivoCentavos,
  )
  return { inicial, mejorado }
}