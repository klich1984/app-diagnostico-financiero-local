import { useMemo } from 'react'
import type {
  TransaccionCompletaDto,
  CategoriaDto,
  SimulacionCompletaDto,
} from '../../data/tauri-commands'
import { calcularMatriz } from '../../domain/agregaciones/matriz'
import { calcularMatrizMejorada } from '../../domain/simulador/matriz-mejorada'
import { formatCentavos } from '../../domain/precision/money'
import { MatrizPresupuesto } from './MatrizPresupuesto'

export interface PresupuestoMejoradoPanelProps {
  transacciones: TransaccionCompletaDto[]
  categorias: CategoriaDto[]
  simulaciones: SimulacionCompletaDto[]
  onIrATransacciones: () => void
}

function formatCentavosConDecimales(centavos: number): string {
  const base = formatCentavos(centavos)
  return base.includes(',') ? base : `${base},00`
}

export function PresupuestoMejoradoPanel({
  transacciones,
  categorias,
  simulaciones,
  onIrATransacciones,
}: PresupuestoMejoradoPanelProps): JSX.Element {
  if (transacciones.length === 0) {
    return (
      <div
        data-testid="empty-state-mejorado"
        className="flex flex-col items-center justify-center rounded-md border border-slate-200 bg-white p-8 text-center"
      >
        <p className="text-sm text-slate-500">
          No hay transacciones registradas. Capturá al menos una transacción para ver el presupuesto mejorado.
        </p>
        <button
          data-testid="btn-ir-transacciones"
          onClick={onIrATransacciones}
          className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          Ir a Transacciones
        </button>
      </div>
    )
  }

  // Mapeamos los DTOs completos a los tipos Min que pide el dominio.
  // El left join está validado para tolerar campos extra pero Typescript
  // pide aserción.
  const matrizInicial = useMemo(
    () => calcularMatriz(transacciones as any, categorias as any),
    [transacciones, categorias],
  )

  const matrizMejorada = useMemo(
    () => calcularMatrizMejorada(transacciones as any, categorias as any, simulaciones),
    [transacciones, categorias, simulaciones],
  )

  const totalGastosMejorado = matrizMejorada.totalGastos
  const deltaAhorro = matrizInicial.totalGastos.minus(totalGastosMejorado)

  return (
    <div data-testid="presupuesto-mejorado-panel" className="space-y-6 p-4">
      {simulaciones.length === 0 && (
        <div
          data-testid="banner-sin-simulaciones"
          className="rounded-md bg-blue-50 p-4"
        >
          <div className="flex">
            <div className="ml-3">
              <h3 className="text-sm font-medium text-blue-800">
                Sin mejoras aplicadas
              </h3>
              <div className="mt-2 text-sm text-blue-700">
                <p>
                  Esta vista refleja qué pasaría si aplicás las mejoras del
                  Simulador. Sin mejoras aplicadas, la matriz es idéntica a la
                  pestaña Presupuesto.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* KPI Strip */}
      <section className="rounded-md border border-slate-200 bg-white p-4">
        <h2 className="text-base font-semibold text-slate-900">
          Resumen Mejorado
        </h2>
        <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-4">
          <div>
            <dt className="text-xs uppercase text-slate-500">
              Total Gastos Actual
            </dt>
            <dd className="text-lg font-mono font-medium text-slate-600">
              {formatCentavosConDecimales(matrizInicial.totalGastos.toNumber())}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-slate-500">
              Total Gastos Mejorado
            </dt>
            <dd
              data-testid="kpi-total-gastos-mejorado"
              className="text-lg font-mono font-bold text-slate-900"
            >
              {formatCentavosConDecimales(totalGastosMejorado.toNumber())}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-slate-500">
              Ahorro Estimado (Delta)
            </dt>
            <dd
              className={`text-lg font-mono font-bold ${
                deltaAhorro.isPositive() ? 'text-green-600' : 'text-slate-600'
              }`}
            >
              {formatCentavosConDecimales(deltaAhorro.toNumber())}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-slate-500">
              FCL Mejorado
            </dt>
            <dd
              className={`text-lg font-mono font-bold ${
                matrizMejorada.flujoCajaLibre.isNegative()
                  ? 'text-red-600'
                  : 'text-green-600'
              }`}
            >
              {formatCentavosConDecimales(
                matrizMejorada.flujoCajaLibre.toNumber(),
              )}
            </dd>
          </div>
        </dl>
      </section>

      {/* Matriz Completa */}
      <div className="rounded-md border border-slate-200 bg-white shadow-sm">
        <MatrizPresupuesto matriz={matrizMejorada} />
      </div>
    </div>
  )
}
