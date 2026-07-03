// MVP Financiero - motor de normalización temporal (REQ-203).
//
// Convierte cualquier monto (con su frecuencia) a su equivalente mensual
// o anual. Es el corazón del cálculo de KPIs: todas las agregaciones
// operan sobre el equivalente mensual para que sumar Gastos + Ingresos
// tenga sentido independientemente de la frecuencia declarada por el
// usuario.
//
// Ver `design.md` §8 (modelo de normalización). Reglas duras:
//   * Nunca usar `Number` para la división: 50000000/3 pierde precisión
//     al tercer dígito. Toda la aritmética va por `Decimal` (configurado
//     a 32 dígitos + ROUND_HALF_EVEN en `domain/precision/money.ts`).
//   * Divisor por frecuencia: Mensual=1, Bimensual=2, Trimestral=3,
//     Semestral=6, Anual=12.
//   * `valorAnual` se compone con `valorMensual` × 12, nunca se calcula
//     por un camino independiente (mantiene la coherencia del modelo).
//
// Nota sobre el `toString()` en español: la UI del producto es español
// neutro (REQ-601), por lo que los `Decimal` que devuelve este módulo
// formatean su parte decimal con `,` en vez de `.` cuando aplica.
// Enteros pasan sin cambios. Esto es un detalle de presentación: el
// valor numérico y la precisión siguen siendo los de `decimal.js`.

import { Decimal } from '../precision/money'

export type Frecuencia = 'Mensual' | 'Bimensual' | 'Trimestral' | 'Semestral' | 'Anual'

/** Tabla canónica de divisores por frecuencia. Una sola fuente de verdad. */
const DIVISOR_POR_FRECUENCIA: Record<Frecuencia, number> = {
  Mensual: 1,
  Bimensual: 2,
  Trimestral: 3,
  Semestral: 6,
  Anual: 12,
}

/**
 * Devuelve el equivalente mensual de `valorCentavos` declarado a la
 * `frecuencia` indicada. Lanza un error si la frecuencia no está en el
 * enum canónico (defensa de runtime porque la cadena puede venir de una
 * fila SQL preexistente a una migración).
 *
 * El `Decimal` retornado tiene su `toString()` localizado al español
 * neutro (coma como separador decimal) para coincidir con el resto de
 * la UI. Su valor numérico y su método `equals` no cambian.
 */
export function valorMensual(valorCentavos: number, frecuencia: Frecuencia): Decimal {
  const divisor = DIVISOR_POR_FRECUENCIA[frecuencia]
  if (divisor === undefined) {
    throw new Error(
      `normalizacion: frecuencia desconocida "${frecuencia}". ` +
        `Valores válidos: Mensual, Bimensual, Trimestral, Semestral, Anual.`,
    )
  }
  const result = new Decimal(valorCentavos).div(divisor)
  return localDecimal(result)
}

/**
 * Devuelve el equivalente anual. Por diseño, se calcula como
 * `valorMensual(…) × 12` (no como `valorCentavos` directo con un divisor
 * distinto), para que la anualización componga con la mensualización
 * (la identidad `valorAnual(Anual) === valorCentavos` se cumple por
 * construcción).
 */
export function valorAnual(valorCentavos: number, frecuencia: Frecuencia): Decimal {
  return valorMensual(valorCentavos, frecuencia).mul(12)
}

/**
 * Devuelve un `Decimal` equivalente al provisto cuyo `toString()` usa la
 * coma como separador decimal (es-ES / es-419), alineándose con el resto
 * de la UI. Para enteros puros (sin parte fraccional), el resultado de
 * `toString()` no cambia.
 *
 * Implementación: clonamos el valor envolviendo `toString` en una capa
 * que reemplaza la primera ocurrencia de `.` por `,`. El resto de los
 * métodos (`equals`, `plus`, `toNumber`, `toFixed`, etc.) se delegan al
 * Decimal original — la envoltura es transparente para el cálculo.
 */
function localDecimal(value: Decimal): Decimal {
  const original = value.toString()
  if (!original.includes('.')) {
    return value
  }
  const spanish = original.replace('.', ',')
  const wrapped = Object.create(value) as Decimal
  wrapped.toString = () => spanish
  return wrapped
}
