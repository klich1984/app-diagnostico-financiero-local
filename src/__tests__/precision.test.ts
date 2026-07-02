import { describe, it, expect } from "vitest";
import { money, zero, Decimal } from "../domain/precision/money";

describe("precision decimal", () => {
  it("acepta string con coma decimal", () => {
    expect(money("1,5").toString()).toBe("1.5");
  });

  it("suma sin drift de coma flotante", () => {
    expect(money(0.1).plus(0.2).toString()).toBe("0.3");
  });

  it("redondeo bancario (ROUND_HALF_EVEN) por defecto", () => {
    // 0.5 redondea a 0 (par), 1.5 redondea a 2 (par)
    expect(new Decimal("0.5").toDecimalPlaces(0).toString()).toBe("0");
    expect(new Decimal("1.5").toDecimalPlaces(0).toString()).toBe("2");
    expect(new Decimal("2.5").toDecimalPlaces(0).toString()).toBe("2");
  });

  it("cero() devuelve Decimal(0)", () => {
    expect(zero().toString()).toBe("0");
  });
});