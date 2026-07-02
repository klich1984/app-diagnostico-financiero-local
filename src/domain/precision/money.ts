// MVP Financiero - módulo de precisión decimal.
//
// Wrapper sobre decimal.js con la configuración por defecto del proyecto:
// - Precisión 28 dígitos significativos (estándar para finanzas).
// - Redondeo bancario (ROUND_HALF_EVEN) para evitar sesgo acumulado.
//
// Toda la aritmética monetaria del proyecto debe pasar por aquí, no usar
// nunca Number para montos. Ver design.md §1 "Reglas arquitectónicas clave".

import Decimal from "decimal.js";

Decimal.set({
  precision: 28,
  rounding: Decimal.ROUND_HALF_EVEN,
});

export type Money = Decimal;

/** Crea un Money a partir de un número o string. Acepta coma como separador decimal. */
export function money(value: number | string): Money {
  if (typeof value === "string") {
    return new Decimal(value.replace(",", "."));
  }
  return new Decimal(value);
}

/** Cero monetario. */
export function zero(): Money {
  return new Decimal(0);
}

export { Decimal };