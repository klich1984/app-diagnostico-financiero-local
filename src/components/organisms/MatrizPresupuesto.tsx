// MatrizPresupuesto — organism de Atomic Design que renderiza la matriz
// de presupuesto agrupada por categoria y naturaleza/comportamiento
// (REQ-301).
//
// Ver `design.md` §10 (materialización del join + SUMIFS) + §7 (capa React,
// Atomic Design: este archivo es un organism porque compone molecules +
// atoms y conoce el modelo de datos hidratado). La responsabilidad del
// component es DUMB: recibe la matriz ya calculada por `calcularMatriz()`
// (dominio puro, sin React ni Tauri) y la renderiza en 2 tablas + un
// footer de totales. El cálculo vive en `src/domain/agregaciones/matriz.ts`
// — la UI no recalcula, sólo formatea.
//
// Contrato de `data-testid` (binding con el test file):
//   * `matriz-presupuesto`   — root container
//   * `matriz-ingresos`      — Ingresos table
//   * `matriz-gastos`        — Gastos table
//   * `matriz-totales`       — Totales footer
//
// Estilo: tailwind utility classes (mismo set que `ListaTransacciones.tsx`
// y `TransaccionForm.tsx`). Valores monetarios: `formatCentavos` (español
// neutro: punto miles, coma decimal), importado del módulo
// `domain/precision/money` (REQ-601). Texto de UI: español neutro, sin
// voseo.

import type { MatrizPresupuesto as MatrizData } from '../../domain/agregaciones/matriz'
import { formatCentavos } from '../../domain/precision/money'

interface MatrizPresupuestoProps {
  matriz: MatrizData
  cargando?: boolean
}

/**
 * Helper local: garantiza la presencia del sufijo ",00" aún cuando el
 * monto no tiene centavos (p.ej. `7.200.000` en vez de `7.200.000,00`).
 *
 * El helper compartido `formatCentavos` omite la parte decimal cuando es
 * cero, lo cual es el comportamiento correcto para la lista de
 * transacciones (donde el sufijo ",00" agrega ruido). Pero en la matriz
 * de presupuesto los totales agregados SIEMPRE muestran los centavos
 * explícitos — es el contrato visible que fija REQ-301 (ver el test
 * `slice10_matriz_presupuesto_renders_totales_in_spanish_locale`).
 *
 * Se mantiene como helper privado del organism: no contamina el helper
 * global, y deja claro que es una decisión de UI localizada.
 */
function formatCentavosConDecimales(centavos: number): string {
  const base = formatCentavos(centavos)
  return base.includes(',') ? base : `${base},00`
}

export function MatrizPresupuesto({
  matriz,
  cargando = false,
}: MatrizPresupuestoProps): JSX.Element {
  if (cargando) {
    return (
      <div
        data-testid="matriz-presupuesto"
        className="p-4 text-sm text-slate-500"
      >
        Calculando matriz…
      </div>
    )
  }

  const noHayTransacciones =
    matriz.ingresos.length === 0 && matriz.gastos.length === 0

  if (noHayTransacciones) {
    return (
      <div data-testid="matriz-presupuesto" className="p-4">
        <p className="text-sm text-slate-500">
          No hay transacciones todavía. Agregá una en la pestaña
          &quot;Transacciones&quot; para ver la matriz.
        </p>
      </div>
    )
  }

  return (
    <div data-testid="matriz-presupuesto" className="space-y-6 p-4">
      {/* Ingresos */}
      <section data-testid="matriz-ingresos">
        <h2 className="text-lg font-semibold text-slate-900">Ingresos</h2>
        <div className="mt-2 overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">
                  Categoría
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium uppercase text-slate-500">
                  Fijo
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium uppercase text-slate-500">
                  Variable
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium uppercase text-slate-500">
                  Total
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium uppercase text-slate-500">
                  Anual
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {matriz.ingresos.map((row) => (
                <tr key={row.categoria}>
                  <td className="px-3 py-2 text-slate-900">{row.categoria}</td>
                  <td className="px-3 py-2 text-right font-mono text-slate-600">
                    {formatCentavos(row.fijo.toNumber())}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-slate-600">
                    {formatCentavos(row.variable.toNumber())}
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-medium text-slate-900">
                    {formatCentavos(row.total.toNumber())}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-slate-500">
                    {formatCentavos(row.totalAnual.toNumber())}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Gastos */}
      <section data-testid="matriz-gastos">
        <h2 className="text-lg font-semibold text-slate-900">Gastos</h2>
        <div className="mt-2 overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">
                  Categoría
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium uppercase text-slate-500">
                  Necesario
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium uppercase text-slate-500">
                  No tan necesario
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium uppercase text-slate-500">
                  No necesario
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium uppercase text-slate-500">
                  Total
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium uppercase text-slate-500">
                  Anual
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {matriz.gastos.map((row) => (
                <tr key={row.categoria}>
                  <td className="px-3 py-2 text-slate-900">{row.categoria}</td>
                  <td className="px-3 py-2 text-right font-mono text-slate-600">
                    {formatCentavos(row.necesario.toNumber())}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-slate-600">
                    {formatCentavos(row.noTanNecesario.toNumber())}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-slate-600">
                    {formatCentavos(row.noNecesario.toNumber())}
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-medium text-slate-900">
                    {formatCentavos(row.total.toNumber())}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-slate-500">
                    {formatCentavos(row.totalAnual.toNumber())}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Totales */}
      <section
        data-testid="matriz-totales"
        className="rounded-md border border-slate-200 bg-white p-4"
      >
        <h2 className="text-base font-semibold text-slate-900">Totales</h2>
        <dl className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div>
            <dt className="text-xs uppercase text-slate-500">Total ingresos</dt>
            <dd className="text-base font-mono font-medium text-green-700">
              {formatCentavosConDecimales(matriz.totalIngresos.toNumber())}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-slate-500">Total gastos</dt>
            <dd className="text-base font-mono font-medium text-red-700">
              {formatCentavosConDecimales(matriz.totalGastos.toNumber())}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-slate-500">Flujo de caja libre</dt>
            <dd
              className={`text-base font-mono font-medium ${
                matriz.flujoCajaLibre.isNegative() ? 'text-red-700' : 'text-green-700'
              }`}
            >
              {formatCentavosConDecimales(matriz.flujoCajaLibre.toNumber())}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  )
}