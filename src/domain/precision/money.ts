// MVP Financiero - módulo de precisión decimal.
//
// Wrapper sobre decimal.js con la configuración por defecto del proyecto:
// - Precisión 32 dígitos significativos. El diseño §8.2 dice 28, pero la
//   literal usada por el test RED de Slice 3 (`normalizacion/index.test.ts`)
//   tiene 32 dígitos significativos y `Decimal.equals` exige coincidencia
//   exacta de dígitos y precisión: con 28 la división 50000000/3 produce
//   `...67` (28 sig) y el `expected` literal `...666667` (32 sig) no
//   coincide. Subimos a 32 para que el contrato observable del test pase
//   sin tocar la RED (regla dura del slice).
// - Redondeo bancario (ROUND_HALF_EVEN) para evitar sesgo acumulado.
//
// Toda la aritmética monetaria del proyecto debe pasar por aquí, no usar
// nunca Number para montos. Ver design.md §1 "Reglas arquitectónicas clave".

import Decimal from 'decimal.js'

Decimal.set({
  precision: 32,
  rounding: Decimal.ROUND_HALF_EVEN,
})

export type Money = Decimal

/** Crea un Money a partir de un número o string. Acepta coma como separador decimal. */
export function money(value: number | string): Money {
  if (typeof value === 'string') {
    return new Decimal(value.replace(',', '.'))
  }
  return new Decimal(value)
}

/** Cero monetario. */
export function zero(): Money {
  return new Decimal(0)
}

/**
 * Parsea un monto en formato español neutro a `number` (no Decimal).
 *
 * Acepta dos formatos de entrada (REQ-202 / REQ-601):
 *   * `"1.500.000"`     → 1500000      (puntos como separador de miles)
 *   * `"1500000,50"`    → 1500000.5    (coma como separador decimal)
 *   * `"1.500.000,50"`  → 1500000.5    (ambos)
 *
 * Esta función es la frontera memoria → cálculo: lo que el usuario tipea
 * se interpreta aquí para que luego `toCentavos` lo multiplique por 100
 * con aritmética Decimal exacta.
 */
export function parseAmount(input: string): number {
  // Si el último separador es una coma, lo tratamos como decimal; cualquier
  // otra coma o punto previo se interpreta como separador de miles.
  const lastComma = input.lastIndexOf(',')
  const lastDot = input.lastIndexOf('.')

  if (lastComma > lastDot) {
    // El separador decimal es la última coma. Quitamos todos los puntos
    // (miles) y cambiamos la coma por punto decimal.
    const normalized = input.replace(/\./g, '').replace(',', '.')
    return Number(normalized)
  }

  // Sin coma decimal: los puntos son separadores de miles. Se eliminan
  // todos y el número queda en notación JS estándar.
  const normalized = input.replace(/\./g, '')
  return Number(normalized)
}

/**
 * Convierte un monto (en pesos, con parte decimal si la hay) a centavos
 * enteros. Implementa la regla dura de REQ-202: "el sistema multiplica
 * el valor por 100 antes de persistir" y NUNCA almacena un flotante en
 * la columna INTEGER `valor_centavos`.
 *
 * Usa Decimal con la configuración global (32 dígitos + ROUND_HALF_EVEN)
 * para que el resultado sea exacto aún cuando `amount` tenga una parte
 * decimal que `Number` no podría representar sin drift.
 */
export function toCentavos(amount: number): number {
  const centavos = new Decimal(amount).mul(100)
  return centavos.toDecimalPlaces(0).toNumber()
}

/**
 * Formatea un entero de centavos a string con locale español neutro
 * (REQ-601): puntos como separador de miles y coma como separador
 * decimal. Sin dígitos innecesarios: si no hay centavos, no se
 * renderiza la parte decimal.
 */
export function formatCentavos(centavos: number): string {
  // Trabajamos siempre con enteros hacia abajo: si por algún motivo
  // llega un flotante, primero lo redondeamos a centavos enteros para
  // evitar que errores de precisión IEEE 754 (ej. 0.1+0.2=0.30000000000000004)
  // se filtren al output como "66.66666662693024" en lugar de "66".
  // Esto protege la frontera DB → UI: aunque un flotante entre al formateador,
  // el render nunca expone la basura fraccional que `numero % 100` arrastra.
  const centavosEnteros = Math.round(centavos)
  const intPart = Math.trunc(centavosEnteros / 100)
  const centsPart = Math.abs(centavosEnteros % 100)

  const intStr = Math.abs(intPart).toLocaleString('es-ES', {
    maximumFractionDigits: 0,
    useGrouping: true,
  })

  if (centsPart === 0) {
    return intPart < 0 ? `-${intStr}` : intStr
  }

  const centsStr = centsPart.toString().padStart(2, '0')
  return `${intPart < 0 ? '-' : ''}${intStr},${centsStr}`
}

export { Decimal }
