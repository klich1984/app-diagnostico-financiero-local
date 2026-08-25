import { useState } from 'react'
import type { EstadoResultados } from '../../domain/kpis'
import { formatCentavos } from '../../domain/precision/money'
import { ModalSalarioObjetivo } from './ModalSalarioObjetivo'

export interface EstadoResultadosPanelProps {
  estado: EstadoResultados
  salarioObjetivoCentavos: number | null
  perfilActivoId: number | null
  onSalarioGuardado: (centavos: number) => Promise<void>
}

interface KpiRow {
  sign?: string
  label: string
  isHeader?: boolean
  isIndent?: boolean
  isTotal?: boolean
  isHighlight?: boolean
  isSemaphore?: boolean
  getValue: (lado: EstadoResultados['inicial']) => number
}

const KPI_ROWS: KpiRow[] = [
  {
    sign: '(+)',
    label: 'INGRESOS MENSUALES',
    isHeader: true,
    getValue: (lado) => lado.total_ingresos.toNumber(),
  },
  {
    sign: '',
    label: 'Ingresos fijos',
    isIndent: true,
    getValue: (lado) => lado.ingresos_fijos.toNumber(),
  },
  {
    sign: '',
    label: 'Ingresos variables',
    isIndent: true,
    getValue: (lado) => lado.ingresos_variables.toNumber(),
  },
  {
    sign: '(-)',
    label: 'GASTOS FIJOS',
    isHeader: true,
    getValue: (lado) => lado.gastos_fijos_total.toNumber(),
  },
  {
    sign: '',
    label: 'Gastos fijos necesarios',
    isIndent: true,
    getValue: (lado) => lado.gastos_fijos_necesarios.toNumber(),
  },
  {
    sign: '',
    label: 'Gastos fijos provisiones',
    isIndent: true,
    getValue: (lado) => lado.gastos_fijos_provisiones.toNumber(),
  },
  {
    sign: '(-)',
    label: 'DEUDAS',
    isHeader: true,
    getValue: (lado) => lado.deudas_total.toNumber(),
  },
  {
    sign: '',
    label: 'Cuota deudas entidades',
    isIndent: true,
    getValue: (lado) => lado.cuota_deudas_entidades.toNumber(),
  },
  {
    sign: '',
    label: 'Cuota deudas conocidos',
    isIndent: true,
    getValue: (lado) => lado.cuota_deudas_conocidos.toNumber(),
  },
  {
    sign: '(=)',
    label: 'FLUJO DE AHORRO 1',
    isTotal: true,
    getValue: (lado) => lado.flujo_ahorro_1.toNumber(),
  },
  {
    sign: '(-)',
    label: 'SALARIO PERSONAL',
    isHeader: true,
    getValue: (lado) =>
      lado.salario_personal_objetivo ? lado.salario_personal_objetivo.toNumber() : 0,
  },
  {
    sign: '(-)',
    label: 'GASTOS VARIABLES',
    isHeader: true,
    getValue: (lado) => lado.gastos_variables_total.toNumber(),
  },
  {
    sign: '',
    label: 'Gastos no tan necesarios',
    isIndent: true,
    getValue: (lado) => lado.gastos_no_tan_necesarios.toNumber(),
  },
  {
    sign: '',
    label: 'Gastos no necesarios',
    isIndent: true,
    getValue: (lado) => lado.gastos_no_necesarios.toNumber(),
  },
  {
    sign: '(=)',
    label: 'FLUJO DE AHORRO 2',
    isTotal: true,
    isSemaphore: true,
    getValue: (lado) => lado.flujo_ahorro_2.toNumber(),
  },
  {
    sign: '',
    label: 'Capacidad inversión',
    isHighlight: true,
    isSemaphore: true,
    getValue: (lado) => lado.capacidad_inversion.toNumber(),
  },
]

export function EstadoResultadosPanel({
  estado,
  salarioObjetivoCentavos,
  perfilActivoId,
  onSalarioGuardado,
}: EstadoResultadosPanelProps): JSX.Element {
  const [modalAbierto, setModalAbierto] = useState(false)

  const mostrarBotonEditar = perfilActivoId !== null && salarioObjetivoCentavos !== null

  async function handleGuardar(centavos: number): Promise<void> {
    await onSalarioGuardado(centavos)
    setModalAbierto(false)
  }

  return (
    <div data-testid="estado-resultados" className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Estado de Resultados</h2>
          {salarioObjetivoCentavos !== null && salarioObjetivoCentavos > 0 ? (
            <p className="mt-1 text-xs text-slate-500">
              Salario personal objetivo: {formatCentavos(salarioObjetivoCentavos)}
            </p>
          ) : null}
        </div>
        {mostrarBotonEditar ? (
          <button
            type="button"
            data-testid="btn-editar-salario"
            onClick={() => setModalAbierto(true)}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-slate-500"
          >
            Editar salario
          </button>
        ) : null}
      </div>

      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-100">
          <tr>
            <th className="w-12 px-2 py-2 text-center text-xs font-semibold text-slate-700"></th>
            <th className="px-3 py-2 text-left text-xs font-semibold text-slate-700">CONCEPTO</th>
            <th className="px-3 py-2 text-right text-xs font-semibold text-slate-700">INICIAL</th>
            <th className="px-3 py-2 text-right text-xs font-semibold text-slate-700">MEJORADO</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 bg-white">
          {KPI_ROWS.map((row) => {
            const inicialCentavos = row.getValue(estado.inicial)
            const mejoradoCentavos = row.getValue(estado.mejorado)

            let rowStyle = ''
            if (row.isHeader) {
              rowStyle = 'font-bold bg-slate-50 text-slate-900'
            } else if (row.isTotal) {
              rowStyle = 'font-bold bg-emerald-50 text-emerald-950 border-y border-emerald-200'
            } else if (row.isHighlight) {
              rowStyle = 'font-bold bg-amber-50 text-amber-950 border-y border-amber-200'
            } else {
              rowStyle = 'text-slate-700'
            }

            const getColorClass = (val: number, isSemaphore: boolean) => {
              if (!isSemaphore) return ''
              return val < 0 ? 'text-red-500' : 'text-green-600'
            }

            return (
              <tr key={row.label} className={rowStyle}>
                <td className="px-2 py-1.5 text-center font-mono text-xs text-slate-500 font-semibold">
                  {row.sign ?? ''}
                </td>
                <td className={`px-3 py-1.5 ${row.isIndent ? 'pl-8 italic text-slate-600' : ''}`}>
                  {row.label}
                </td>
                <td className={`px-3 py-1.5 text-right font-mono ${getColorClass(inicialCentavos, !!row.isSemaphore)}`}>
                  {formatCentavos(inicialCentavos)}
                </td>
                <td className={`px-3 py-1.5 text-right font-mono ${getColorClass(mejoradoCentavos, !!row.isSemaphore)}`}>
                  {formatCentavos(mejoradoCentavos)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {modalAbierto ? (
        <ModalSalarioObjetivo
          perfilActivoId={perfilActivoId}
          salarioActualCentavos={salarioObjetivoCentavos}
          onGuardar={handleGuardar}
          onCancelar={() => setModalAbierto(false)}
        />
      ) : null}
    </div>
  )
}
