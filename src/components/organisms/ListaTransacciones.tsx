// ListaTransacciones — organism de Atomic Design que lista las
// transacciones del perfil activo (REQ-202).
//
// Ver `design.md` §7 (capa React, Atomic Design: este archivo es un
// organism porque compone molecules + atoms y conoce el modelo de datos
// hidratado). La responsabilidad del component es DUMB: recibe las
// transacciones ya cargadas por el padre, las renderiza en una tabla, y
// delega la acción de eliminar al callback `onEliminar` que el padre
// provee. La confirmación, el refetch y la integración con el IPC viven
// en `App.tsx` — mantener este organism tonto facilita testearlo sin
// levantar el runtime de Tauri.
//
// Contrato de `data-testid` (binding con el test file):
//   * `lista-transacciones`       — root container
//   * `lista-vacia`              — empty-state message node
//   * `lista-cargando`           — loading-state message node
//   * `fila-transaccion`         — cada fila
//   * `eliminar-{id}`            — botón eliminar de cada fila
//
// Estilo: tailwind utility classes (mismo set que `TransaccionForm.tsx`).
// Valores monetarios: `formatCentavos` (español neutro: punto miles,
// coma decimal), importado del módulo `domain/precision/money` (REQ-601).
// Texto de UI: español neutro, sin voseo.

import type { TransaccionCompletaDto } from '../../data/tauri-commands'
import { formatCentavos } from '../../domain/precision/money'

interface ListaTransaccionesProps {
  transacciones: TransaccionCompletaDto[]
  cargando: boolean
  onEliminar: (id: number) => Promise<void> | void
}

export function ListaTransacciones({
  transacciones,
  cargando,
  onEliminar,
}: ListaTransaccionesProps): JSX.Element {
  if (cargando) {
    return (
      <p
        data-testid="lista-cargando"
        className="text-sm text-slate-500"
      >
        Cargando transacciones…
      </p>
    )
  }

  if (transacciones.length === 0) {
    return (
      <p
        data-testid="lista-vacia"
        className="text-sm text-slate-500"
      >
        No hay transacciones todavía.
      </p>
    )
  }

  return (
    <div data-testid="lista-transacciones" className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-4 py-2 text-left text-xs font-medium uppercase text-slate-500">
              Concepto
            </th>
            <th className="px-4 py-2 text-left text-xs font-medium uppercase text-slate-500">
              Tipo
            </th>
            <th className="px-4 py-2 text-left text-xs font-medium uppercase text-slate-500">
              Frecuencia
            </th>
            <th className="px-4 py-2 text-left text-xs font-medium uppercase text-slate-500">
              Valor
            </th>
            <th className="px-4 py-2 text-left text-xs font-medium uppercase text-slate-500">
              Categoría
            </th>
            <th className="px-4 py-2 text-right text-xs font-medium uppercase text-slate-500">
              Acciones
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 bg-white">
          {transacciones.map((t) => (
            <tr key={t.id} data-testid="fila-transaccion">
              <td className="px-4 py-2 text-sm text-slate-900">{t.concepto}</td>
              <td className="px-4 py-2 text-sm">
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                    t.tipo_flujo === 'Ingreso'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-red-100 text-red-700'
                  }`}
                >
                  {t.tipo_flujo}
                </span>
              </td>
              <td className="px-4 py-2 text-sm text-slate-600">{t.frecuencia}</td>
              <td className="px-4 py-2 text-sm font-mono text-slate-900">
                {formatCentavos(t.valor_centavos)}
              </td>
              <td className="px-4 py-2 text-sm text-slate-600">{t.categoria_nombre}</td>
              <td className="px-4 py-2 text-right">
                <button
                  type="button"
                  data-testid={`eliminar-${t.id}`}
                  onClick={() => onEliminar(t.id)}
                  className="text-xs text-red-600 hover:text-red-800"
                >
                  Eliminar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}