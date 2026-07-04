// MVP Financiero - matriz de agregación virtual (REQ-301).
//
// Replica el comportamiento de las fórmulas SUMIFS del Excel fuente
// (`docs/analisis-plantilla-financiera.md`) en TypeScript. La capa
// `domain/agregaciones/` es la única autorizada para agrupar transacciones
// por categoria × naturaleza × comportamiento; las páginas React consumen
// el resultado pero no recalculan.
//
// Reglas duras (ver `design.md` §1 "Reglas arquitectónicas" + §9 motor de
// cálculo):
//   * Toda la aritmética monetaria va por `Decimal` (configurado a 32
//     dígitos + ROUND_HALF_EVEN en `domain/precision/money.ts`). Nunca se
//     usa `Number` para sumar/productos de `valor_centavos`. Esto evita
//     drift de IEEE-754 en divisiones no exactas como 350_000_000/3.
//   * Cada transacción se normaliza a su equivalente mensual con
//     `valorMensual` de `domain/normalizacion` antes de sumarse. Eso
//     garantiza que sumar Ingresos + Gastos sea comparable aunque las
//     frecuencias declaradas difieran.
//   * Las categorias sin transacciones en el input NO se omiten: todas
//     las categorias del catálogo aparecen en el resultado (con totales
//     en cero) para que la UI pueda mostrar el catálogo completo.
//
// La decisión de incluir las categorias sin transacciones es un trade-off
// declarado en la sesión de planning: la UI de "Presupuesto" muestra la
// grilla completa de categorias aunque el usuario aún no haya capturado
// gastos en algunas. En cambio, el módulo `graficos.ts` (REQ-302) sí
// descarta los buckets vacíos porque distorsionarían los porcentajes.

import { Decimal } from '../precision/money'
import { valorMensual, type Frecuencia } from '../normalizacion'

// ---------------------------------------------------------------------------
// Tipos de entrada mínimos.
// ---------------------------------------------------------------------------

/**
 * Representación mínima de una transacción que necesita el agregador.
 * Se mantiene compatible con la fila SQL de `Transacciones` y con el
 * objeto cargado en memoria (mismas claves y mismos tipos literales).
 *
 * Notas de pin (ver `slice-4-test-plan.md` §Decisiones de pin):
 *   * `grupo_pertenencia` en `CategoriaMin` es el alias TS para la
 *     columna SQL `Categorias.tipo_flujo`. La traducción se hace al
 *     cargar las categorias desde la DB.
 *   * `comportamiento` y `naturaleza_necesidad` son opcionales porque el
 *     CHECK constraint cruzado exige que solo los Gastos los tengan; los
 *     Ingresos llegan con esos campos como `undefined`.
 *   * `concepto` y `notas` son metadatos del enunciado del gasto/ingreso
 *     (TEXT NOT NULL y TEXT NULL respectivamente en SQL). El agregador
 *     no los usa para calcular — se exponen para que la UI pueda
 *     mostrar tooltipes o drill-downs — pero los incluye para que el
 *     tipo sea estructuralmente compatible con la fila SQL completa y
 *     con los fixtures del golden test.
 */
export interface TransaccionMin {
  id?: number
  tipo_flujo: 'Ingreso' | 'Gasto'
  categoria_id: number
  frecuencia: Frecuencia
  comportamiento?: 'Fijo' | 'Variable'
  naturaleza_necesidad?: 'Necesario' | 'No tan necesario' | 'No necesario'
  valor_centavos: number
  concepto?: string
  notas?: string | null
}

export interface CategoriaMin {
  id: number
  nombre: string
  grupo_pertenencia: 'INGRESO' | 'GASTO'
}

// ---------------------------------------------------------------------------
// Tipos de salida.
// ---------------------------------------------------------------------------

/** Bucket de Ingreso: separa Fijo vs Variable y suma en `total`. */
export interface MatrizIngreso {
  categoria: string
  fijo: Decimal
  variable: Decimal
  total: Decimal
  totalAnual: Decimal
}

/** Bucket de Gasto: separa los 3 niveles de necesidad y suma en `total`. */
export interface MatrizGasto {
  categoria: string
  necesario: Decimal
  noTanNecesario: Decimal
  noNecesario: Decimal
  total: Decimal
  totalAnual: Decimal
}

/**
 * Salida completa de `calcularMatriz`. Contiene los buckets por categoria
 * y los totales agregados (mensuales y anualizados) más el Flujo de Caja
 * Libre. Todos los `Decimal` están en centavos; el formateo a pesos
 * ocurre en la UI con `formatCentavos`.
 */
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

// ---------------------------------------------------------------------------
// Implementación.
// ---------------------------------------------------------------------------

const DOCE = new Decimal(12)

/**
 * Acumuladores internos que se construyen antes de emitir un bucket. Se
 * separan del tipo público para no exponer el detalle de indexación y
 * poder mutarlos con `+=` (Decimal es inmutable — usamos `.plus()`).
 */
interface AcumuladorIngreso {
  fijo: Decimal
  variable: Decimal
}

interface AcumuladorGasto {
  necesario: Decimal
  noTanNecesario: Decimal
  noNecesario: Decimal
}

/**
 * Construye la matriz de presupuesto agrupando `transacciones` por
 * categoria y naturaleza/comportamiento. La función es **pura**: no
 * toca la DB, no muta sus argumentos, no depende de React ni de Tauri.
 * Se puede llamar tanto en tests como en la UI con la misma garantía
 * de cierre al centavo contra el Excel (ver `golden-mvp.test.ts`).
 *
 * Algoritmo:
 *   1. Inicializar un acumulador por cada categoria del catálogo
 *      (aunque no tenga transacciones, para mostrar el catálogo
 *      completo en la UI).
 *   2. Para cada transacción:
 *      - Si es Ingreso, sumar su equivalente mensual al bucket de su
 *        categoria bajo el comportamiento declarado (Fijo / Variable).
 *      - Si es Gasto, sumar bajo el nivel de necesidad declarado.
 *   3. Ordenar los buckets por `total` DESC para que el render sea
 *      estable y los totales grandes aparezcan arriba (legibilidad).
 *   4. Calcular los totales agregados y el Flujo de Caja Libre anual
 *      como compuesto del mensual (mantiene la identidad `anual = 12
 *      × mensual` incluso con decimales largos).
 */
export function calcularMatriz(
  transacciones: TransaccionMin[],
  categorias: CategoriaMin[],
): MatrizPresupuesto {
  // 1. Inicializar acumuladores por cada categoria del catálogo.
  const accIngresos = new Map<number, AcumuladorIngreso>()
  const accGastos = new Map<number, AcumuladorGasto>()
  const nombrePorId = new Map<number, string>()

  for (const cat of categorias) {
    nombrePorId.set(cat.id, cat.nombre)
    if (cat.grupo_pertenencia === 'INGRESO') {
      accIngresos.set(cat.id, { fijo: new Decimal(0), variable: new Decimal(0) })
    } else {
      accGastos.set(cat.id, {
        necesario: new Decimal(0),
        noTanNecesario: new Decimal(0),
        noNecesario: new Decimal(0),
      })
    }
  }

  // 2. Acumular transacciones. Se descartan aquellas cuyo categoria_id no
  //    está en el catálogo (datos huérfanos quedarían concentrados en un
  //    único bucket "sin categoría" que el Excel fuente no maneja).
  for (const tx of transacciones) {
    const mensual = valorMensual(tx.valor_centavos, tx.frecuencia)

    if (tx.tipo_flujo === 'Ingreso') {
      const acc = accIngresos.get(tx.categoria_id)
      if (!acc) continue
      if (tx.comportamiento === 'Fijo') {
        acc.fijo = acc.fijo.plus(mensual)
      } else if (tx.comportamiento === 'Variable') {
        acc.variable = acc.variable.plus(mensual)
      }
      continue
    }

    if (tx.tipo_flujo === 'Gasto') {
      const acc = accGastos.get(tx.categoria_id)
      if (!acc) continue
      if (tx.naturaleza_necesidad === 'Necesario') {
        acc.necesario = acc.necesario.plus(mensual)
      } else if (tx.naturaleza_necesidad === 'No tan necesario') {
        acc.noTanNecesario = acc.noTanNecesario.plus(mensual)
      } else if (tx.naturaleza_necesidad === 'No necesario') {
        acc.noNecesario = acc.noNecesario.plus(mensual)
      }
    }
  }

  // 3. Emitir buckets. El orden por `total` DESC es importante para
  //    estabilidad visual; usamos Number para el comparador porque solo
  //    decide el orden de filas (no se usa para aritmética).
  const ingresos: MatrizIngreso[] = []
  for (const [id, acc] of accIngresos) {
    const total = acc.fijo.plus(acc.variable)
    ingresos.push({
      categoria: nombrePorId.get(id) ?? '',
      fijo: acc.fijo,
      variable: acc.variable,
      total,
      totalAnual: total.mul(DOCE),
    })
  }
  ingresos.sort((a, b) => b.total.cmp(a.total))

  const gastos: MatrizGasto[] = []
  for (const [id, acc] of accGastos) {
    const total = acc.necesario.plus(acc.noTanNecesario).plus(acc.noNecesario)
    gastos.push({
      categoria: nombrePorId.get(id) ?? '',
      necesario: acc.necesario,
      noTanNecesario: acc.noTanNecesario,
      noNecesario: acc.noNecesario,
      total,
      totalAnual: total.mul(DOCE),
    })
  }
  gastos.sort((a, b) => b.total.cmp(a.total))

  // 4. Totales agregados. Se calculan a partir de los buckets ya
  //    normalizados a mensual para evitar doble conteo o drift si el
  //    set de transacciones se filtra en una capa superior.
  const totalIngresos = ingresos.reduce(
    (acc, b) => acc.plus(b.total),
    new Decimal(0),
  )
  const totalGastos = gastos.reduce(
    (acc, b) => acc.plus(b.total),
    new Decimal(0),
  )
  const flujoCajaLibre = totalIngresos.minus(totalGastos)

  return {
    ingresos,
    gastos,
    totalIngresos,
    totalIngresosAnual: totalIngresos.mul(DOCE),
    totalGastos,
    totalGastosAnual: totalGastos.mul(DOCE),
    flujoCajaLibre,
    flujoCajaLibreAnual: flujoCajaLibre.mul(DOCE),
  }
}
