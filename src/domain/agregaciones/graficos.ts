// MVP Financiero - distribución porcentual por categoría (REQ-302).
//
// Pre-calcula los datos que `Recharts` consumirá para renderizar las
// gráficas de torta (gastos) y barras (ingresos). Se mantiene separado
// de `matriz.ts` porque:
//
//   * Genera un payload con `porcentaje: number` (0..100, 2 decimales)
//     listo para serializar a un componente React, mientras que la
//     matriz trabaja en `Decimal` puro para la UI tabular.
//   * Aplica un filtro distinto: descarta las categorías del catálogo
//     sin transacciones, mientras que la matriz las conserva (con
//     totales en cero) para mostrar el catálogo completo.
//
// Reglas (ver `slice-4-test-plan.md` §`graficos.test.ts`):
//   * `Decimal` para `valor` (mismo PrecisionPolicy que la matriz).
//   * `porcentaje = (valor / total_general) × 100`, redondeado a 2
//     decimales. La suma puede diferir de 100 ±0.01 por redondeo;
//     ese es el contrato explícito del test `porcentajes_suman_100`.
//   * Orden por `valor` DESC. Recharts renderiza mejor cuando los
//     líderes aparecen primero.
//   * Categorías con cero transacciones en el input NO aparecen en el
//     resultado (test `ignora_categorias_sin_transacciones`).
//
// Cálculo:
//   * Cada transacción se normaliza a su equivalente mensual con
//     `valorMensual` (REQ-203). Sin esa normalización, un Trimestral
//     de $300K aparecería en el chart como 75% en vez de 50%, distorsionando
//     la lectura del usuario.

import { Decimal } from '../precision/money'
import { valorMensual } from '../normalizacion'
import type { TransaccionMin, CategoriaMin } from './matriz'

/**
 * Resultado por categoria: el `valor` (en centavos, `Decimal`) alimenta
 * el `<Tooltip>` de Recharts; el `porcentaje` (0..100, dos decimales)
 * alimenta la etiqueta del segmento. Ambos son "display-only": la UI
 * los formatea con separadores de miles.
 */
export interface DistribucionPorcentual {
  label: string
  valor: Decimal
  porcentaje: number
}

const CIEN = new Decimal(100)
const DOS_DECIMALES = 2

/**
 * Acumula el equivalente mensual de cada transacción en su categoria,
 * agrupado por `tipo_flujo`. Devuelve un mapa `categoria_id → Decimal`
 * con los totales ya normalizados a mensual.
 */
function acumularPorCategoria(
  transacciones: TransaccionMin[],
  tipoFlujo: 'Ingreso' | 'Gasto',
): Map<number, Decimal> {
  const acc = new Map<number, Decimal>()
  for (const tx of transacciones) {
    if (tx.tipo_flujo !== tipoFlujo) continue
    const mensual = valorMensual(tx.valor_centavos, tx.frecuencia)
    acc.set(tx.categoria_id, (acc.get(tx.categoria_id) ?? new Decimal(0)).plus(mensual))
  }
  return acc
}

/**
 * Convierte el mapa de acumulados en `DistribucionPorcentual[]`:
 *   * Filtra las categorias que no tienen transacciones en el input
 *     (`acc.has(id)`). Ver `ignora_categorias_sin_transacciones`.
 *   * Ordena por `valor` DESC. Ver `distribucion_ordenada_descendente`.
 *   * Calcula porcentaje con división Decimal y `toDecimalPlaces(2)`
 *     para que el `number` resultante sea comparable con tolerancia
 *     `<= 0.01`.
 *
 * `totalGeneral` es la suma de TODAS las categorias en `acc`. Si la
 * suma fuera cero (no hay transacciones del tipo pedido), devolvemos
 * una lista vacía para evitar el `0/0 = NaN` que rompería el chart.
 */
function materializar(
  categorias: CategoriaMin[],
  acc: Map<number, Decimal>,
  tipoFlujo: 'Ingreso' | 'Gasto',
): DistribucionPorcentual[] {
  // Filtramos el catálogo: solo nos interesan las categorias del tipo
  // pedido (Ingreso o Gasto) que tengan al menos una transacción.
  const candidatos = categorias.filter(
    (c) => c.grupo_pertenencia === (tipoFlujo === 'Ingreso' ? 'INGRESO' : 'GASTO'),
  )

  let totalGeneral = new Decimal(0)
  for (const valor of acc.values()) {
    totalGeneral = totalGeneral.plus(valor)
  }

  if (totalGeneral.isZero()) {
    return []
  }

  const items: DistribucionPorcentual[] = []
  for (const cat of candidatos) {
    const valor = acc.get(cat.id)
    if (valor === undefined) continue
    // Porcentaje como Decimal hasta el final para evitar drift. El
    // `.toNumber()` solo opera sobre un valor ya redondeado a 2
    // decimales, así que no introduce error de IEEE-754 relevante.
    const porcentaje = valor
      .div(totalGeneral)
      .mul(CIEN)
      .toDecimalPlaces(DOS_DECIMALES)
      .toNumber()
    items.push({
      label: cat.nombre,
      valor,
      porcentaje,
    })
  }

  items.sort((a, b) => b.valor.cmp(a.valor))
  return items
}

/**
 * Distribución porcentual de los Gastos por categoria. Pensada para el
 * chart de torta principal del dashboard: cada segmento es una categoria
 * con su porcentaje del total mensual de gastos.
 */
export function distribucionGastosPorCategoria(
  transacciones: TransaccionMin[],
  categorias: CategoriaMin[],
): DistribucionPorcentual[] {
  const acc = acumularPorCategoria(transacciones, 'Gasto')
  return materializar(categorias, acc, 'Gasto')
}

/**
 * Distribución porcentual de los Ingresos por categoria. Pensada para el
 * chart de barras del dashboard: cada barra es una categoria de ingreso
 * con su porcentaje del total mensual.
 */
export function distribucionIngresosPorCategoria(
  transacciones: TransaccionMin[],
  categorias: CategoriaMin[],
): DistribucionPorcentual[] {
  const acc = acumularPorCategoria(transacciones, 'Ingreso')
  return materializar(categorias, acc, 'Ingreso')
}
