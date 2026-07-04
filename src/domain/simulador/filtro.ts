// MVP Financiero - filtro aislante de gastos no esenciales (REQ-401).
//
// Ver `openspec/changes/mvp-financiero-local-first/spec.md` §REQ-401 y
// `design.md` §10.1 (filtro aislante) + §10.4 (materialización del
// left join). Las páginas React del Panel Simulador pasan por este
// módulo antes de mandar las transacciones a la matriz mejorada, para
// que la UI muestre SOLO las filas que el usuario puede reasignar un
// nuevo valor mensual.
//
// Reglas duras (de la spec + diseño):
//   * Ingresos NUNCA se incluyen, sin importar el valor de
//     `naturaleza_necesidad` (el cross-column CHECK de la tabla
//     `Transacciones` ya garantiza que es NULL para Ingreso, pero el
//     filtro lo verifica igual por defensa contra datos corruptos).
//   * Gastos con `naturaleza_necesidad = 'Necesario'` NO se incluyen
//     (son los costes fijos que el simulador no debe tocar).
//   * Gastos con `naturaleza_necesidad = 'No tan necesario'` o
//     `'No necesario'` SÍ se incluyen — son el universo sobre el que
//     el panel del simulador opera.
//   * El módulo es puro: no toca DB, no muta el array de entrada, no
//     depende de React ni de Tauri. Esto lo hace trivialmente testeable
//     y reutilizable desde cualquier capa.

import type { TransaccionMin } from '../agregaciones'

/**
 * Predicado de una sola fila: devuelve `true` si `t` es un Gasto cuya
 * `naturaleza_necesidad` lo marca como candidato legítimo para una
 * propuesta del Simulador.
 *
 * La regla de Ingreso está duplicada en `filtrarGastosNoEsenciales`
 * para que ambos funcionen como una sola unidad lógica, pero un
 * caller que reciba filas sueltas puede usar este predicado
 * directamente (p. ej. para resaltar visualmente una fila).
 */
export function esGastoNoEsencial(t: TransaccionMin): boolean {
  if (t.tipo_flujo !== 'Gasto') return false
  return (
    t.naturaleza_necesidad === 'No necesario' ||
    t.naturaleza_necesidad === 'No tan necesario'
  )
}

/**
 * Devuelve un NUEVO array con solo los gastos no esenciales del
 * input. El orden original se preserva (no se reordena) y el array
 * de entrada no se muta. Esto cumple el contrato de "función pura"
 * que los tests de slice 5 pinea.
 */
export function filtrarGastosNoEsenciales(
  transacciones: TransaccionMin[],
): TransaccionMin[] {
  return transacciones.filter(esGastoNoEsencial)
}