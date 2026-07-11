// SimuladorPanel — organism (Atomic Design) que renderiza el panel del
// Simulador (REQ-602 + REQ-401).
//
// Ver `openspec/changes/mvp-financiero-local-first/spec.md` §REQ-401,
// §REQ-602, §REQ-603 y `design.md` §10 (matriz mejorada) + §11 (Panel
// Simulador). La responsabilidad del organism es:
//   1. Recibir los arrays crudos (`transacciones`, `categorias`,
//      `simulaciones`) ya hidratados por la capa `data/`.
//   2. Filtrar las transacciones con `filtrarGastosNoEsenciales`
//      (domain/simulador/filtro.ts §REQ-401 — el universo aislante del
//      Simulador excluye los gastos `Necesario`).
//   3. Por cada gasto filtrado, mostrar:
//        - el concepto y metadata (categoria + frecuencia + necesidad)
//        - un `<input>` CONTROLADO con el valor propuesto en PESOS (lo
//          que el usuario ve y tipea), debounced (300 ms via
//          `createDebouncedCallback` de `domain/simulador/debounce.ts`)
//          que manda CENTAVOS al backend.
//        - un botón de borrado (×) para limpiar la propuesta y volver
//          al valor base (`onEliminar(transaccionId)`)
//   4. Mostrar resultados agregados (ahorro mensual, anual y nuevo FCL)
//     calculados con `calcularMatrizMejorada` para que el usuario vea
//     en vivo el impacto de sus cambios.
//
// ## Slice 11 bugfix: input controlado
//
// El IMPL original usaba `defaultValue` (uncontrolled) + `parseCentavosInput`
// (que interpretaba el input como centavos literales). Cuando el debounce
// disparaba el upsert, el re-render con el `defaultValue` formateado pisaba
// el texto que el usuario estaba tipeando. Peor: tipear "150000" mandaba
// 150.000 centavos ($1.500) en lugar de 15.000.000 centavos ($150.000).
//
// El fix:
//   1. `parsePesosInput` (de `domain/precision/money`) interpreta el input
//      como PESOS y devuelve CENTAVOS (×100 + Math.round).
//   2. El `<input>` es CONTROLADO (`value` + `onChange`); el local state
//      guarda el string crudo que el usuario tipea. El re-render del padre
//      ya no pisa el texto porque el state local tiene prioridad.
//   3. `formatCentavosForInput` se usa SOLO como valor inicial del state
//      local (cuando el usuario todavía no tocó el campo), nunca en el
//      render activo.
//
// Contrato de `data-testid` (binding con el test file):
//   * `simulador-panel`         — root container
//   * `simulador-input-{id}`    — input por cada gasto simulable
//   * `simulador-vacio`         — placeholder del empty state
//
// Estilo: tailwind utility classes (mismo set que `MatrizPresupuesto.tsx`
// y `ListaTransacciones.tsx`). Texto de UI: español neutro, sin voseo.

import { useMemo, useState } from 'react'
import { formatCentavos, parsePesosInput } from '../../domain/precision/money'
import { filtrarGastosNoEsenciales } from '../../domain/simulador/filtro'
import { calcularMatrizMejorada } from '../../domain/simulador/matriz-mejorada'
import { createDebouncedCallback } from '../../domain/simulador/debounce'
import type {
  CategoriaDto,
  SimulacionCompletaDto,
  TransaccionCompletaDto,
  UpsertSimulacionInput,
} from '../../data/tauri-commands'

export interface SimuladorPanelProps {
  transacciones: TransaccionCompletaDto[]
  categorias: CategoriaDto[]
  simulaciones: SimulacionCompletaDto[]
  onUpsert: (input: UpsertSimulacionInput) => void | Promise<void>
  onEliminar: (transaccionId: number) => void | Promise<void>
  cargando?: boolean
}

/**
 * Frecuencia → factor mensual. Replica la lógica de
 * `domain/normalizacion.ts::valorMensual` sin importar el módulo entero
 * (el organism sólo necesita este detalle — pull del resto del
 * normalizador contaminaría la capa UI con tipos del dominio de cálculo).
 */
function factorMensual(frecuencia: TransaccionCompletaDto['frecuencia']): number {
  switch (frecuencia) {
    case 'Mensual':
      return 1
    case 'Bimensual':
      return 2
    case 'Trimestral':
      return 3
    case 'Semestral':
      return 6
    case 'Anual':
      return 12
    default:
      return 1
  }
}

/**
 * Formatea un entero de centavos a string PESOS (sin la parte decimal
 * si es cero) para mostrar en el `<input>` como valor inicial. Se usa
 * SOLO en la inicialización del state local del input — NUNCA durante
 * el render activo (el render activo usa el string crudo que el usuario
 * tipeó, para que un re-render del padre no pise lo que está escribiendo).
 *
 * Ejemplos:
 *   formatCentavosForInput(0)        → "0"
 *   formatCentavosForInput(15_000_000) → "150.000"
 *   formatCentavosForInput(15_000_050) → "150.000,5"  (max 2 decimals)
 */
function formatCentavosForInput(centavos: number): string {
  if (centavos === 0) return '0'
  const pesos = centavos / 100
  return pesos.toLocaleString('es-ES', { maximumFractionDigits: 2 })
}

export function SimuladorPanel({
  transacciones,
  categorias,
  simulaciones,
  onUpsert,
  onEliminar,
  cargando = false,
}: SimuladorPanelProps): JSX.Element {
  // Filtramos una sola vez (cache por referencia) las transacciones que
  // entran al universo del Simulador. Slice 5 / §REQ-401.
  //
  // `filtrarGastosNoEsenciales` toma `TransaccionMin[]` (forma mínima);
  // `TransaccionCompletaDto` es estructuralmente compatible porque sus
  // campos extra (`categoria_nombre`, `usuario_id`, `id`, `created_at`,
  // `updated_at`) son un superset. El doble cast `as unknown as` es
  // necesario porque TypeScript NO permite el cast directo cuando
  // hay campos opcionales con variantes de `null` vs `undefined`
  // (caso de `comportamiento` y `naturaleza_necesidad`). El bugfix
  // del slice 11 (`| null | undefined` en el DTO) hace que el cast
  // siga siendo válido end-to-end.
  const gastosNoEsenciales = useMemo(
    () =>
      filtrarGastosNoEsenciales(
        transacciones as unknown as Parameters<typeof filtrarGastosNoEsenciales>[0],
      ),
    [transacciones],
  )

  // Map PK → DTO completo (con `categoria_nombre`, `usuario_id`, etc.)
  // para que el render del input pueda leer esos campos. El filtro
  // (`gastosNoEsenciales`) sólo conoce la forma mínima, así que
  // necesitamos volver al array original para mostrar el label.
  const txById = useMemo(
    () => new Map(transacciones.map((t) => [t.id, t])),
    [transacciones],
  )

  // Matriz mejorada: misma fórmula que `calcularMatriz`, pero con las
  // propuestas del Simulador aplicadas en línea. Se recalcula sólo
  // cuando cambian las transacciones / categorias / simulaciones.
  const matrizMejorada = useMemo(() => {
    const catsMin = categorias.map((c) => ({
      id: c.id,
      nombre: c.nombre,
      grupo_pertenencia:
        c.grupo_pertenencia === 'Ingreso' ? 'INGRESO' : 'GASTO',
    })) as unknown as Parameters<typeof calcularMatrizMejorada>[1]
    const simsMin = simulaciones.map((s) => ({
      transaccion_id: s.transaccion_id,
      nuevo_valor_centavos: s.nuevo_valor_centavos,
    })) as unknown as Parameters<typeof calcularMatrizMejorada>[2]
    return calcularMatrizMejorada(
      transacciones as unknown as Parameters<typeof calcularMatrizMejorada>[0],
      catsMin,
      simsMin,
    )
  }, [transacciones, categorias, simulaciones])

  // Debounce de 300 ms para el envío de propuestas a SQLite (REQ-402).
  // La UI dispara `call(input)` en cada keystroke; el backend sólo se
  // invoca tras 300 ms de inactividad (la última propuesta gana).
  const debouncedUpsert = useMemo(
    () =>
      createDebouncedCallback<UpsertSimulacionInput>(
        (input) => {
          void onUpsert(input)
        },
        300,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onUpsert],
  )

  // State local: el string crudo que el usuario tipeó en cada input,
  // indexado por `transaccion_id`. La clave es la PK de la transacción,
  // NO la posición en la lista, así un reorden del padre no rompe el
  // binding. Cuando el usuario todavía no tocó un campo, el fallback
  // es el valor formateado en PESOS (no centavos) — coherente con lo
  // que el usuario espera ver y tipear.
  const [inputValues, setInputValues] = useState<Record<number, string>>({})

  // Helper para leer el string del input con fallback al valor
  // inicial (centavos del backend formateados a PESOS).
  const valueFor = (id: number, centavos: number): string =>
    inputValues[id] ?? formatCentavosForInput(centavos)

  // Ahorro mensual total: lo que el usuario gasta hoy en gastos no
  // esenciales menos lo que propone gastar en el simulador. El
  // resultado se anualiza (x12) en el render.
  const ahorroMensual = useMemo(() => {
    let actual = 0
    for (const t of gastosNoEsenciales) {
      actual += t.valor_centavos / factorMensual(t.frecuencia)
    }
    const txById = new Map(transacciones.map((t) => [t.id, t]))
    let simulado = 0
    for (const s of simulaciones) {
      const tx = txById.get(s.transaccion_id)
      if (!tx) continue
      simulado += s.nuevo_valor_centavos / factorMensual(tx.frecuencia)
    }
    return actual - simulado
  }, [gastosNoEsenciales, simulaciones, transacciones])

  if (cargando) {
    return (
      <p data-testid="simulador-vacio" className="p-4 text-sm text-slate-500">
        Cargando simulador…
      </p>
    )
  }

  if (gastosNoEsenciales.length === 0) {
    return (
      <p data-testid="simulador-vacio" className="p-4 text-sm text-slate-500">
        No hay gastos no esenciales para simular.
      </p>
    )
  }

  return (
    <div data-testid="simulador-panel" className="space-y-6 p-4">
      <section>
        <h2 className="text-lg font-semibold text-slate-900">
          Simulá tus gastos no esenciales
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Cambiá los valores abajo para ver cómo mejora tu flujo de caja
          libre.
        </p>

        <ul className="mt-4 space-y-2">
          {gastosNoEsenciales.map((t) => {
            // `t.id` is optional on `TransaccionMin` pero SIEMPRE está
            // presente en las filas que devuelve `listarTransacciones`
            // (la PK autoincrement nunca es NULL). El `!` es seguro
            // porque el origen es el DTO del IPC, no input del usuario.
            const id = t.id as number
            const dto = txById.get(id)
            const sim = simulaciones.find((s) => s.transaccion_id === id)
            const currentValue = sim ? sim.nuevo_valor_centavos : t.valor_centavos
            return (
              <li
                key={id}
                data-testid={`simulador-row-${id}`}
                className="flex items-center justify-between rounded-md border border-slate-200 bg-white p-3"
              >
                <div>
                  <div className="text-sm font-medium text-slate-900">
                    {dto?.concepto ?? t.concepto}
                  </div>
                  <div className="text-xs text-slate-500">
                    {dto?.categoria_nombre ?? '—'} · {t.frecuencia} ·{' '}
                    {dto?.naturaleza_necesidad ?? '—'}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    inputMode="decimal"
                    data-testid={`simulador-input-${id}`}
                    // CONTROLADO: el value SIEMPRE refleja el state local
                    // (lo que el usuario tipeó). El `valueFor` cae al
                    // formateo en PESOS solo en la inicialización, así el
                    // re-render del padre (post-debounce) no pisa lo que
                    // el usuario está escribiendo.
                    value={valueFor(id, currentValue)}
                    onChange={(e) => {
                      const raw = e.target.value
                      // 1) Actualizar el state local PRIMERO: el input
                      //    sigue mostrando lo que el usuario tipeó.
                      setInputValues((prev) => ({ ...prev, [id]: raw }))
                      // 2) Convertir PESOS → CENTAVOS y disparar el
                      //    debounce. Si el input es inválido, no
                      //    mandamos nada al backend.
                      const centavos = parsePesosInput(raw)
                      if (
                        centavos !== null &&
                        dto !== undefined &&
                        dto.usuario_id !== undefined
                      ) {
                        debouncedUpsert.call({
                          transaccionId: id,
                          nuevoValorCentavos: centavos,
                          usuarioId: dto.usuario_id,
                        })
                      }
                    }}
                    aria-label={`Nuevo valor propuesto para ${dto?.concepto ?? t.concepto}`}
                    className="w-32 rounded-md border border-slate-300 bg-white px-2 py-1 text-right text-sm font-mono"
                  />
                  {sim ? (
                    <button
                      type="button"
                      data-testid={`simulador-eliminar-${id}`}
                      onClick={() => onEliminar(id)}
                      aria-label={`Eliminar propuesta de ${dto?.concepto ?? t.concepto}`}
                      className="rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                    >
                      ×
                    </button>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      <section
        data-testid="simulador-resultados"
        className="rounded-md border border-slate-200 bg-white p-4"
      >
        <h2 className="text-base font-semibold text-slate-900">
          Resultados de la simulación
        </h2>
        <dl className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div>
            <dt className="text-xs uppercase text-slate-500">Ahorro mensual</dt>
            <dd
              className={`text-base font-mono font-medium ${
                ahorroMensual > 0 ? 'text-green-700' : 'text-slate-700'
              }`}
            >
              {formatCentavos(ahorroMensual)}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-slate-500">Ahorro anual</dt>
            <dd
              className={`text-base font-mono font-medium ${
                ahorroMensual > 0 ? 'text-green-700' : 'text-slate-700'
              }`}
            >
              {formatCentavos(ahorroMensual * 12)}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-slate-500">Nuevo FCL</dt>
            <dd
              className={`text-base font-mono font-medium ${
                matrizMejorada.flujoCajaLibre.isNegative()
                  ? 'text-red-700'
                  : 'text-green-700'
              }`}
            >
              {formatCentavos(matrizMejorada.flujoCajaLibre.toNumber())}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  )
}
