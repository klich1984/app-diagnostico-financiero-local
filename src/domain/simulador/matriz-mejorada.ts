// MVP Financiero - matriz de presupuesto mejorada (REQ-403 + REQ-605).
//
// Ver `openspec/changes/mvp-financiero-local-first/spec.md` §REQ-403 y
// `design.md` §10.4 (materialización del left join entre `Transacciones`
// y `Simulador`) + §17 (reglas de redondeo R-NUEVO-*).
//
// Este módulo toma los mismos inputs que `calcularMatriz` (transacciones
// + categorias) y AGREGA las propuestas del Simulador (`Simulacion[]`)
// para producir un `MatrizPresupuesto` que refleja el "qué pasaría si
// el usuario aplicara sus propuestas". Es el corazón del Panel
// Simulador: la UI llama a esta función y renderiza la matriz "antes
// vs después" lado a lado.
//
// Relación con `calcularMatriz` (slice 4):
//   * Esta función NO re-implementa la agregación por categoria.
//   * Construye una vista "materializada" de las transacciones donde
//     los gastos con propuesta tienen su `valor_centavos` reemplazado
//     por el `nuevo_valor_centavos` del Simulador (ya normalizado a
//     mensual por la UI) y delega el cálculo final en `calcularMatriz`.
//   * Esta indirección mantiene la "única fuente de verdad" del
//     cálculo (matriz.ts) y reduce el riesgo de drift entre la versión
//     base y la mejorada.
//
// Reglas duras:
//   * Los Ingresos NUNCA se reemplazan — ni siquiera si su `id` aparece
//     en `simulaciones` (defensa contra UI bugueada o datos corruptos).
//   * Si `nuevo_valor_centavos = 0`, el gasto se considera "cortado" y
//     aporta 0 al bucket de su categoria. El `calcularMatriz` ya
//     maneja correctamente esa entrada (la suma con Decimal sigue
//     dando 0 aunque el valor original sea grande).
//   * Las simulaciones sobre transacciones SIN `id` se ignoran — sin
//     el `id` no hay forma de hacer el join (`Transaccion.id` es la PK
//     referenciada por `Simulador.transaccion_id`). En la práctica los
//     tests siempre lo proveen.

import { Decimal } from '../precision/money'
import {
  calcularMatriz,
  type CategoriaMin,
  type MatrizPresupuesto,
  type TransaccionMin,
} from '../agregaciones'
import type { Frecuencia } from '../normalizacion'

// ---------------------------------------------------------------------------
// Tipos públicos del dominio Simulador.
// ---------------------------------------------------------------------------

/**
 * Una propuesta del Simulador: para la transacción con id
 * `transaccion_id`, el usuario quiere asignar `nuevo_valor_centavos`
 * como nuevo monto MENSUAL (en centavos).
 *
 * La UI es responsable de normalizar el input del usuario (que puede
 * estar en cualquier frecuencia) a un valor mensual antes de invocar
 * el backend; eso evita doble-conversión.
 */
export interface Simulacion {
  transaccion_id: number
  nuevo_valor_centavos: number
}

// ---------------------------------------------------------------------------
// Implementación.
// ---------------------------------------------------------------------------

/**
 * Calcula la matriz mejorada: igual que `calcularMatriz` pero con las
 * propuestas del Simulador aplicadas.
 *
 * Algoritmo:
 *   1. Indexa las simulaciones en un `Map<transaccion_id, Simulacion>`
 *      para búsqueda O(1) al mapear.
 *   2. Construye un array NUEVO de transacciones donde:
 *        - Los Gastos con `id` que aparece en `simulaciones` se
 *          reemplazan por una copia con `valor_centavos` = nuevo valor
 *          y `frecuencia` forzada a `'Mensual'` (el nuevo valor ya
 *          está normalizado a mensual).
 *        - Los Ingresos nunca se tocan.
 *        - Las transacciones sin `id` o sin propuesta quedan igual.
 *   3. Delega en `calcularMatriz` para que la agregación sea
 *      exactamente la misma fórmula que la versión base.
 *
 * @param transacciones  Filas crudas (deben incluir `id` cuando
 *                       tengan propuesta — ver el comentario del
 *                       módulo).
 * @param categorias     Catálogo completo de categorias (mismo shape
 *                       que `calcularMatriz`).
 * @param simulaciones   Lista de propuestas del Simulador.
 */
export function calcularMatrizMejorada(
  transacciones: TransaccionMin[],
  categorias: CategoriaMin[],
  simulaciones: Simulacion[],
): MatrizPresupuesto {
  // 1. Index de simulaciones para O(1) lookup.
  const simByTxId = new Map<number, Simulacion>()
  for (const s of simulaciones) {
    simByTxId.set(s.transaccion_id, s)
  }

  // 2. Materialización de la vista con propuestas aplicadas.
  const transaccionesMejoradas: TransaccionMin[] = transacciones.map((t) => {
    if (t.tipo_flujo !== 'Gasto' || t.id === undefined) return t
    const sim = simByTxId.get(t.id)
    if (!sim) return t
    return {
      ...t,
      valor_centavos: sim.nuevo_valor_centavos,
      // El nuevo valor ya viene normalizado a mensual (la UI lo
      // convirtió antes de mandarlo); forzamos la frecuencia para
      // que `valorMensual` no divida de nuevo.
      frecuencia: 'Mensual' as Frecuencia,
    }
  })

  // 3. Reutilizamos el agregador canónico: misma fórmula, mismos
  //    totales, misma composición Decimal. La matriz mejorada es
  //    *exactamente* la matriz base con un subconjunto de filas
  //    reescrito — no hay drift posible entre las dos.
  return calcularMatriz(transaccionesMejoradas, categorias)
}

// Re-export de `Decimal` solo por conveniencia de callers que
// quieran comparar totales directamente sin re-importar `precision`.
export { Decimal }