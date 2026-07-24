import type { EstadoResultados } from '../../domain/kpis'
import { formatCentavos } from '../../domain/precision/money'

export interface EstadoResultadosPanelProps {
  estado: EstadoResultados
  salarioObjetivoCentavos: number | null
}

interface KpiRow {
  label: string
  getValue: (lado: EstadoResultados['inicial']) => number
}

const KPI_ROWS: KpiRow[] = [
  { label: 'Ingresos totales', getValue: (lado) => lado.total_ingresos.toNumber() },
  { label: 'Gastos totales', getValue: (lado) => lado.total_gastos.toNumber() },
  {
    label: 'FA1 — Flujo de caja libre',
    getValue: (lado) => lado.flujo_ahorro_1.toNumber(),
  },
  {
    label: 'FA2 — Flujo de ahorro 2',
    getValue: (lado) => lado.flujo_ahorro_2.toNumber(),
  },
  {
    label: 'Capacidad de inversión',
    getValue: (lado) => lado.capacidad_inversion.toNumber(),
  },
  { label: 'FA1 anual', getValue: (lado) => lado.fcl_anual.toNumber() },
  { label: 'FA2 anual', getValue: (lado) => lado.fa2_anual.toNumber() },
  { label: 'Cap. Inv. anual', getValue: (lado) => lado.cap_inv_anual.toNumber() },
]

export function EstadoResultadosPanel({
  estado,
  salarioObjetivoCentavos,
}: EstadoResultadosPanelProps): JSX.Element {
  return (
    <div data-testid="estado-resultados" className="space-y-4 p-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Estado de Resultados</h2>
        {salarioObjetivoCentavos !== null && salarioObjetivoCentavos > 0 ? (
          <p className="mt-1 text-xs text-slate-500">
            Salario personal objetivo: {formatCentavos(salarioObjetivoCentavos)}
          </p>
        ) : null}
      </div>

      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">KPI</th>
            <th className="px-3 py-2 text-right text-xs font-medium uppercase text-slate-500">Inicial</th>
            <th className="px-3 py-2 text-right text-xs font-medium uppercase text-slate-500">Delta</th>
            <th className="px-3 py-2 text-right text-xs font-medium uppercase text-slate-500">Mejorado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 bg-white">
          {KPI_ROWS.map((row) => {
            const inicialCentavos = row.getValue(estado.inicial)
            const mejoradoCentavos = row.getValue(estado.mejorado)
            const deltaCentavos = mejoradoCentavos - inicialCentavos
            const deltaClass = deltaCentavos >= 0 ? 'text-green-700' : 'text-red-700'
            const deltaPrefix = deltaCentavos > 0 ? '+' : ''

            return (
              <tr key={row.label}>
                <td className="px-3 py-2 text-slate-900">{row.label}</td>
                <td className="px-3 py-2 text-right font-mono text-slate-700">
                  {formatCentavos(inicialCentavos)}
                </td>
                <td className={`px-3 py-2 text-right font-mono font-medium ${deltaClass}`}>
                  {deltaPrefix}{formatCentavos(deltaCentavos)}
                </td>
                <td className="px-3 py-2 text-right font-mono font-medium text-slate-900">
                  {formatCentavos(mejoradoCentavos)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
