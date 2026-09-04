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
        className="flex flex-col items-center justify-center rounded-md border border-white/10 bg-zinc-900 p-8 text-center"
      >
        <p           className="text-sm text-slate-300">
          No hay transacciones registradas. Capturá al menos una transacción para ver el presupuesto
          mejorado.
        </p>
        <button
          data-testid="btn-ir-transacciones"
          onClick={onIrATransacciones}
          className="mt-4 rounded-md bg-[#f05454] px-4 py-2 text-sm font-medium text-white hover:bg-[#d94444] focus:outline-none focus:ring-2 focus:ring-[#f05454] focus:ring-offset-2 focus:ring-offset-zinc-900"
        >
          Ir a Transacciones
        </button>
      </div>
    )
  }

  // Normaliza grupo_pertenencia al formato que espera el dominio
  // ('INGRESO' | 'GASTO'), ya que el DTO del IPC viene en TitleCase
  // ('Ingreso' | 'Gasto'). Mismo patrón que App.tsx.
  const catsNormalizadas = useMemo(
    () =>
      categorias.map((c) => ({
        ...c,
        grupo_pertenencia: c.grupo_pertenencia.toUpperCase() === 'INGRESO' ? 'INGRESO' : 'GASTO',
      })) as any,
    [categorias],
  )

  const matrizInicial = useMemo(
    () => calcularMatriz(transacciones as any, catsNormalizadas),
    [transacciones, catsNormalizadas],
  )

  const matrizMejorada = useMemo(
    () => calcularMatrizMejorada(transacciones as any, catsNormalizadas, simulaciones),
    [transacciones, catsNormalizadas, simulaciones],
  )

  const totalGastosMejorado = matrizMejorada.totalGastos
  const deltaAhorro = matrizInicial.totalGastos.minus(totalGastosMejorado)

  return (
    <div data-testid="presupuesto-mejorado-panel" className="space-y-6 p-4">
      {simulaciones.length === 0 && (
        <div data-testid="banner-sin-simulaciones" className="rounded-md bg-blue-950/40 border border-blue-500/20 p-4">
          <div className="flex">
            <div className="ml-3">
              <h3 className="text-sm font-medium text-blue-300">Sin mejoras aplicadas</h3>
              <div className="mt-2 text-sm text-blue-400">
                <p>
                  Esta vista refleja qué pasaría si aplicás las mejoras del Simulador. Sin mejoras
                  aplicadas, la matriz es idéntica a la pestaña Presupuesto.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* KPI Strip */}
      <section className="rounded-md border border-white/10 bg-zinc-900 p-4">
        <h2 className="text-base font-semibold text-slate-100">Resumen Mejorado</h2>
        <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-4">
          <div className="flex flex-col justify-between gap-1">
            <dt className="text-xs uppercase text-slate-300">Total Gastos Actual</dt>
            <dd className="font-mono text-base font-medium text-slate-300">
              {formatCentavosConDecimales(matrizInicial.totalGastos.toNumber())}
            </dd>
          </div>
          <div className="flex flex-col justify-between gap-1">
            <dt className="text-xs uppercase text-slate-300">Total Gastos Mejorado</dt>
            <dd
              data-testid="kpi-total-gastos-mejorado"
              className="font-mono text-base font-medium text-slate-100"
            >
              {formatCentavosConDecimales(totalGastosMejorado.toNumber())}
            </dd>
          </div>
          <div className="flex flex-col justify-between gap-1">
            <dt className="text-xs uppercase text-slate-300">Ahorro Estimado (Delta)</dt>
            <dd
              className={`font-mono text-base font-medium ${
                deltaAhorro.isPositive() ? 'text-green-400' : 'text-slate-300'
              }`}
            >
              {formatCentavosConDecimales(deltaAhorro.toNumber())}
            </dd>
          </div>
          <div className="flex flex-col justify-between gap-1">
            <dt className="text-xs uppercase text-slate-300">FCL Mejorado</dt>
            <dd
              className={`font-mono text-base font-medium ${
                matrizMejorada.flujoCajaLibre.isNegative() ? 'text-red-400' : 'text-green-400'
              }`}
            >
              {formatCentavosConDecimales(matrizMejorada.flujoCajaLibre.toNumber())}
            </dd>
          </div>
        </dl>
      </section>

      {/* Matriz Completa */}
      <div className="rounded-md border border-white/10 bg-zinc-900 shadow-sm">
        <MatrizPresupuesto matriz={matrizMejorada} />
      </div>
    </div>
  )
}
