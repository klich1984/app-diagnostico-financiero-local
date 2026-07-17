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
//          que el usuario ve y tipea). El string tipeado queda en state
//          local hasta que el usuario hace click en el botón "Aplicar"
//          (REQ-402 manual commit — slice 12 reemplaza el antiguo
//          debounce de 300 ms).
//        - un botón "Aplicar" (`data-testid="aplicar-{id}"`) que
//          dispara `onUpsert` con PESOS → CENTAVOS al backend.
//        - un botón de borrado (×) para limpiar la propuesta y volver
//          al valor base (`onEliminar(transaccionId)`)
//   4. Mostrar resultados agregados (ahorro mensual, anual y nuevo FCL)
//     calculados con `calcularMatrizMejorada` para que el usuario vea
//     en vivo el impacto de sus cambios. La matriz mejorada incluye un
//     "preview" de los valores tipeados pero todavía no aplicados
//     (merge de `simulaciones` persistidas + `inputValues` locales).
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
// ## Slice 12 evolution: Aplicar button (REQ-402 manual commit)
//
// El IMPL de slice 11 disparaba `onUpsert` con un debounce de 300 ms en
// cada keystroke, lo que producía escrituras sorprendentes a SQLite
// mientras el usuario editaba. El nuevo contrato es: cada fila tiene un
// botón explícito "Aplicar", y `onUpsert` SOLO se invoca cuando el
// usuario hace click ahí. El botón se deshabilita cuando el valor
// tipeado coincide con el valor persistido (no hay diff para commit),
// y se habilita en cuanto difiere.
//
// El state local `inputValues` (map transaccionId → string crudo) sigue
// siendo la fuente de verdad del `<input>`. Al hacer click en Aplicar,
// (a) se invoca `onUpsert` con PESOS→CENTAVOS, y (b) se limpia la entry
// de `inputValues` para esa fila (el padre re-renderiza con la nueva
// `simulaciones`, el input cae al formato persistido, y el botón se
// vuelve a deshabilitar).
//
// Contrato de `data-testid` (binding con el test file):
//   * `simulador-panel`         — root container
//   * `simulador-input-{id}`    — input por cada gasto simulable
//   * `simulador-vacio`         — placeholder del empty state
//   * `aplicar-{id}`            — botón Aplicar por fila (REQ-402)
//
// Estilo: tailwind utility classes (mismo set que `MatrizPresupuesto.tsx`
// y `ListaTransacciones.tsx`). Texto de UI: español neutro, sin voseo.

import { useMemo, useState } from 'react'
import { formatCentavos, parsePesosInput } from '../../domain/precision/money'
import { filtrarGastosNoEsenciales } from '../../domain/simulador/filtro'
import { calcularMatrizMejorada } from '../../domain/simulador/matriz-mejorada'
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

  // Slice 12 (REQ-402): una fila está "dirty" si el usuario tipeó un
  // valor que parsea a CENTAVOS distintos del valor persistido. El
  // botón "Aplicar" se habilita solo cuando `isDirty` es true; cuando
  // es false (input vacío, inválido o coincide con el valor base), el
  // botón permanece deshabilitado.
  const isDirty = (id: number, currentCentavos: number): boolean => {
    const raw = inputValues[id]
    if (raw === undefined) return false
    const parsed = parsePesosInput(raw)
    if (parsed === null) return false
    return parsed !== currentCentavos
  }

  // Preview de simulaciones: merge entre las simulaciones PERSISTIDAS
  // (`simulaciones`, que ya están en SQLite) y los valores tipeados pero
  // todavía NO aplicados (`inputValues`, locales). Esto permite que la
  // matriz mejorada y el ahorro mensual reflejen el impacto en vivo de
  // lo que el usuario está tipeando, sin esperar al click en Aplicar.
  //
  // Nota: las entries con `inputValues` cuyo parseo falla (`null`) o
  // que coinciden con el valor persistido NO sobrescriben la simulación
  // persistida — solo los diffs reales entran al preview.
  const previewSimulaciones = useMemo(() => {
    const merged = new Map<number, SimulacionCompletaDto>()
    for (const s of simulaciones) {
      merged.set(s.transaccion_id, s)
    }
    for (const [idStr, raw] of Object.entries(inputValues)) {
      const id = Number(idStr)
      const persisted = simulaciones.find((s) => s.transaccion_id === id)
      const baseCentavos = persisted
        ? persisted.nuevo_valor_centavos
        : (txById.get(id)?.valor_centavos ?? 0)
      const parsed = parsePesosInput(raw)
      if (parsed !== null && parsed !== baseCentavos) {
        // El placeholder mantiene la forma del DTO; sólo necesitamos
        // `transaccion_id` + `nuevo_valor_centavos` para alimentar
        // `calcularMatrizMejorada` (los otros campos se ignoran).
        merged.set(id, {
          id: 0,
          usuario_id: 0,
          transaccion_id: id,
          nuevo_valor_centavos: parsed,
          created_at: 0,
          updated_at: 0,
        })
      }
    }
    return Array.from(merged.values())
  }, [simulaciones, inputValues, txById])

  // Matriz mejorada: misma fórmula que `calcularMatriz`, pero con las
  // propuestas del Simulador aplicadas en línea (incluyendo el preview
  // local). Se recalcula sólo cuando cambian las transacciones /
  // categorias / simulaciones / inputValues.
  const matrizMejorada = useMemo(() => {
    const catsMin = categorias.map((c) => ({
      id: c.id,
      nombre: c.nombre,
      grupo_pertenencia:
        c.grupo_pertenencia === 'Ingreso' ? 'INGRESO' : 'GASTO',
    })) as unknown as Parameters<typeof calcularMatrizMejorada>[1]
    const simsMin = previewSimulaciones.map((s) => ({
      transaccion_id: s.transaccion_id,
      nuevo_valor_centavos: s.nuevo_valor_centavos,
    })) as unknown as Parameters<typeof calcularMatrizMejorada>[2]
    return calcularMatrizMejorada(
      transacciones as unknown as Parameters<typeof calcularMatrizMejorada>[0],
      catsMin,
      simsMin,
    )
  }, [transacciones, categorias, previewSimulaciones])

  // Ahorro mensual total: lo que el usuario gasta hoy en gastos no
  // esenciales menos lo que propone gastar en el simulador (incluyendo
  // el preview local — tipeos todavía no aplicados). El resultado se
  // anualiza (x12) en el render.
  const ahorroMensual = useMemo(() => {
    let actual = 0
    for (const t of gastosNoEsenciales) {
      actual += t.valor_centavos / factorMensual(t.frecuencia)
    }
    let simulado = 0
    for (const s of previewSimulaciones) {
      const tx = txById.get(s.transaccion_id)
      if (!tx) continue
      simulado += s.nuevo_valor_centavos / factorMensual(tx.frecuencia)
    }
    return actual - simulado
  }, [gastosNoEsenciales, previewSimulaciones, txById])

  // Flag global: ¿hay alguna fila con cambios sin aplicar? Lo usamos
  // para anotar la sección de Resultados con un "(preview)" sutil que
  // recuerda al usuario que está mirando valores tipeados que todavía
  // no se persisten.
  const hasPendingChanges = useMemo(
    () => Object.keys(inputValues).length > 0,
    [inputValues],
  )

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
                    // re-render del padre no pisa lo que el usuario está
                    // escribiendo.
                    //
                    // Slice 12 (REQ-402): el onChange SOLO actualiza el
                    // state local — ya NO dispara el debounce. El commit
                    // a SQLite queda en manos del botón "Aplicar" →
                    // evitar escrituras sorprendentes mientras el
                    // usuario edita.
                    value={valueFor(id, currentValue)}
                    onChange={(e) => {
                      const raw = e.target.value
                      setInputValues((prev) => ({ ...prev, [id]: raw }))
                    }}
                    aria-label={`Nuevo valor propuesto para ${dto?.concepto ?? t.concepto}`}
                    className="w-32 rounded-md border border-slate-300 bg-white px-2 py-1 text-right text-sm font-mono"
                  />
                  {/*
                    Botón "Aplicar" (REQ-402 manual commit). El handler
                    re-lee el string del state local (no del input.value,
                    que es exactamente lo mismo pero más frágil ante
                    edge-cases del DOM), lo parsea PESOS→CENTAVOS, y
                    dispara onUpsert. Tras el commit, limpiamos la entry
                    de `inputValues` para esa fila: el padre re-renderiza
                    con la nueva simulación persistida, el input cae al
                    formato del valor base, y el botón se deshabilita.
                  */}
                  <button
                    type="button"
                    data-testid={`aplicar-${id}`}
                    onClick={() => {
                      const raw = inputValues[id]
                      if (raw === undefined) return
                      const centavos = parsePesosInput(raw)
                      if (
                        centavos === null ||
                        dto === undefined ||
                        dto.usuario_id === undefined
                      ) {
                        return
                      }
                      void onUpsert({
                        transaccionId: id,
                        nuevoValorCentavos: centavos,
                        usuarioId: dto.usuario_id,
                      })
                      setInputValues((prev) => {
                        const next = { ...prev }
                        delete next[id]
                        return next
                      })
                    }}
                    disabled={!isDirty(id, currentValue)}
                    aria-label={`Aplicar nuevo valor propuesto para ${dto?.concepto ?? t.concepto}`}
                    className="rounded-md bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                  >
                    Aplicar
                  </button>
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
              {hasPendingChanges ? (
                <span className="ml-1 text-xs text-slate-400">
                  (preview)
                </span>
              ) : null}
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
              {hasPendingChanges ? (
                <span className="ml-1 text-xs text-slate-400">
                  (preview)
                </span>
              ) : null}
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
