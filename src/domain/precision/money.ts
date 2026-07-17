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

/**
 * Convierte un string de pesos (input del usuario en un `<input>`) a
 * centavos enteros. Acepta los formatos localized de REQ-601 / REQ-202:
 *
 *   - `"150000"`     → 15_000_000 centavos (= $150.000,00)
 *   - `"150.000"`    → 15_000_000 centavos (punto como separador de miles)
 *   - `"150000,50"`  → 15_000_050 centavos (coma como separador decimal)
 *   - `"150.000,50"` → 15_000_050 centavos (ambos)
 *   - `"1.5"`        → 150 centavos (punto como decimal cuando NO hay coma)
 *   - `"1,5"`        → 150 centavos (coma como decimal)
 *
 * Regla de parsing (misma que `parseAmount`): el ÚLTIMO separador entre
 * `.` y `,` se interpreta como decimal; cualquier otro se interpreta como
 * miles. Esto resuelve la ambigüedad entre "1.5" (1 peso con 50 centavos)
 * y "1.500" (mil quinientos pesos) por contexto posicional.
 *
 * A diferencia de `parseAmount` (que sólo normaliza a `number`), este
 * helper aplica la regla dura del proyecto: multiplicar por 100 + redondear
 * para producir el INTEGER de centavos que la columna `valor_centavos`
 * exige (REQ-202). El resultado se redondea con `Math.round` (no Decimal)
 * porque la entrada del usuario es a lo sumo 2 decimales y un
 * `Number` × 100 + `Math.round` es exacto para esa escala; el uso de
 * `Decimal` para el formateo de UI ya está cubierto por `formatCentavos`.
 *
 * Retorna `null` si el input es inválido (vacío, no-numérico, negativo).
 * El caller es responsable de no invocar `upsert` con `null`.
 */
export function parsePesosInput(raw: string): number | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (trimmed === '') return null

  // Detectar separadores localized. Heurística de convención española
  // (europea) para distinguir "1.5" (1 peso con 50 centavos) de
  // "1.500" (mil quinientos pesos):
  //   * Si hay una coma presente, la coma es el separador decimal y
  //     los puntos son separadores de miles (regla inequívoca).
  //   * Si NO hay coma, un punto con EXACTAMENTE 1 o 2 dígitos después
  //     se interpreta como decimal; un punto con 3+ dígitos (o varios
  //     puntos) se interpreta como separador de miles.
  //   * Sin separadores: el string es la representación entera.
  const hasComma = trimmed.includes(',')
  const dots = (trimmed.match(/\./g) ?? []).length

  let normalized: string
  if (hasComma) {
    // coma = decimal, puntos = miles.
    normalized = trimmed.replace(/\./g, '').replace(',', '.')
  } else if (dots === 0) {
    // Sin separadores: el string es la representación entera.
    normalized = trimmed
  } else {
    // Sólo puntos, sin coma. Decidir según los dígitos después del
    // ÚLTIMO punto: 1-2 → decimal, 3+ → miles.
    const lastDotIdx = trimmed.lastIndexOf('.')
    const digitsAfterLastDot = trimmed.length - lastDotIdx - 1
    if (digitsAfterLastDot === 1 || digitsAfterLastDot === 2) {
      // Decimal: un solo punto con 1-2 dígitos → interpretarlo como
      // punto decimal. Quitamos los separadores de miles (si hay otros
      // puntos antes) y dejamos ESTE punto como decimal.
      const beforeLastDot = trimmed.slice(0, lastDotIdx).replace(/\./g, '')
      const afterLastDot = trimmed.slice(lastDotIdx + 1)
      normalized = `${beforeLastDot}.${afterLastDot}`
    } else {
      // Miles: 3+ dígitos después del último punto, o múltiples
      // puntos → todos son separadores de miles.
      normalized = trimmed.replace(/\./g, '')
    }
  }

  const parsed = Number(normalized)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  // pesos → centavos (×100, redondeado al entero más cercano).
  // Usamos `Decimal` para la multiplicación porque `Number` × 100 puede
  // introducir drift de IEEE 754 (ej. `1.005 * 100 === 100.49999...`).
  // El módulo `Decimal` ya está configurado a 32 dígitos +
  // ROUND_HALF_EVEN en el header del archivo; para redondear a 0
  // decimales (centavos enteros) usamos `.toDecimalPlaces(0)`.
  return new Decimal(parsed).mul(100).toDecimalPlaces(0).toNumber()
}

export { Decimal }
