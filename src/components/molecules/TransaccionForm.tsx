// TransaccionForm — molecule de captura manual de una transacción (REQ-202).
//
// Es la frontera entre la UI y el modelo de dominio. Reglas duras:
//   * El form convierte el valor tipeado por el usuario a INTEGER centavos
//     (`× 100`) ANTES de llamar a `onSubmit`. Es el contrato REQ-202:
//     "el sistema interpreta el valor como 1500000 y lo persiste
//     multiplicado por 100".
//   * El form bloquea el submit si `concepto` está vacío o si `valor`
//     es <= 0. La validación del DB (CHECK constraint en `valor_centavos`)
//     es la segunda línea de defensa; el form es la primera.
//   * `tipo_flujo` y `categoria_id` son selects dependientes: cambiar el
//     primero filtra las opciones del segundo (REQ-201 / §7 React layer).
//   * `comportamiento` y `naturaleza_necesidad` solo son requeridos para
//     `Gasto` (lo exige el cross-column CHECK del schema).
//
// Ver `design.md` §7 (capa React, Atomic Design: este archivo es un
// molecule) y §1 (regla de centavos).

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { parseAmount, toCentavos } from '../../domain/precision/money'
import type { Frecuencia } from '../../domain/normalizacion'

export type TipoFlujo = 'Ingreso' | 'Gasto'

export type Comportamiento = 'Fijo' | 'Variable'

export type NaturalezaNecesidad = 'Necesario' | 'No tan necesario' | 'No necesario'

export interface CategoriaOption {
  id: number
  nombre: string
  tipo_flujo: TipoFlujo
}

export interface TransaccionInput {
  tipo_flujo: TipoFlujo
  categoria_id: number
  concepto: string
  frecuencia: Frecuencia
  valor_centavos: number
  // Required only for Gasto (cross-column CHECK en SQL). The form is the
  // single source of truth para estos selects, así que viajamos con el
  // payload completo a `onSubmit` para que el wrapper IPC los mande a
  // `cmd_insert_transaccion` sin transformaciones.
  comportamiento: Comportamiento | null
  naturaleza_necesidad: NaturalezaNecesidad | null
}

export interface TransaccionFormProps {
  categorias: CategoriaOption[]
  onSubmit: (input: TransaccionInput) => void | Promise<void>
}

const FRECUENCIAS: Frecuencia[] = ['Mensual', 'Bimensual', 'Trimestral', 'Semestral', 'Anual']

const COMPORTAMIENTOS: Comportamiento[] = ['Fijo', 'Variable']

const NATURALEZAS: NaturalezaNecesidad[] = ['Necesario', 'No tan necesario', 'No necesario']

interface FormErrors {
  concepto?: string
  valor?: string
}

export function TransaccionForm({ categorias, onSubmit }: TransaccionFormProps): JSX.Element {
  const [tipoFlujo, setTipoFlujo] = useState<TipoFlujo>('Gasto')
  const [concepto, setConcepto] = useState('')
  const [valorRaw, setValorRaw] = useState('')
  const [frecuencia, setFrecuencia] = useState<Frecuencia>('Mensual')
  const [comportamiento, setComportamiento] = useState<Comportamiento>('Fijo')
  const [naturaleza, setNaturaleza] = useState<NaturalezaNecesidad>('Necesario')
  const [errors, setErrors] = useState<FormErrors>({})

  // Categorías filtradas por tipo_flujo. Memo para no recalcular en cada
  // render cuando `tipoFlujo` no cambia.
  const categoriasFiltradas = useMemo(
    () => categorias.filter((c) => c.tipo_flujo === tipoFlujo),
    [categorias, tipoFlujo],
  )

  const [categoriaId, setCategoriaId] = useState<number>(() => categoriasFiltradas[0]?.id ?? 0)

  // Sync `categoriaId` when `categoriasFiltradas` changes. The lazy
  // `useState` initializer above only runs on mount; if categorias arrive
  // async after mount (the App.tsx `key={formKey}` remount pattern),
  // `categoriaId` would stay at 0 and the next submit would violate the
  // `categoria_id` FOREIGN KEY. This effect also handles the case where
  // the current categoria is no longer in the filtered subset.
  useEffect(() => {
    if (categoriasFiltradas.length === 0) return
    if (categoriaId === 0 || !categoriasFiltradas.some((c) => c.id === categoriaId)) {
      setCategoriaId(categoriasFiltradas[0].id)
    }
  }, [categoriasFiltradas, categoriaId])

  // Cuando cambia el tipo de flujo, sincronizamos la categoría para que
  // el select siempre apunte a una categoría válida del subconjunto
  // filtrado. Si la categoría actual ya no existe en el nuevo conjunto,
  // saltamos a la primera del nuevo conjunto.
  const handleTipoFlujoChange = (next: TipoFlujo) => {
    setTipoFlujo(next)
    const subset = categorias.filter((c) => c.tipo_flujo === next)
    if (!subset.some((c) => c.id === categoriaId)) {
      setCategoriaId(subset[0]?.id ?? 0)
    }
  }

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    // Validación de UI (primera línea de defensa antes del SQL CHECK).
    const nextErrors: FormErrors = {}
    const conceptoTrimmed = concepto.trim()
    if (conceptoTrimmed.length === 0) {
      nextErrors.concepto = 'El concepto es obligatorio.'
    }

    const parsed = parseAmount(valorRaw)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      nextErrors.valor = 'El valor debe ser un número mayor a cero.'
    }

    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      return
    }

    // Conversión a centavos ENTEROS antes de cruzar la frontera del form.
    const valorCentavos = toCentavos(parsed)

    void onSubmit({
      tipo_flujo: tipoFlujo,
      categoria_id: categoriaId,
      concepto: conceptoTrimmed,
      frecuencia,
      valor_centavos: valorCentavos,
      // `comportamiento` is editable for both Ingreso and Gasto; `naturaleza`
      // is Gasto-only (see the section comment above the renders).
      comportamiento,
      naturaleza_necesidad: tipoFlujo === 'Gasto' ? naturaleza : null,
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto max-w-lg space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
      noValidate
    >
      <h2 className="text-xl font-semibold text-slate-900">Nueva transacción</h2>

      {/* Tipo de flujo */}
      <div className="space-y-1">
        <label htmlFor="tipo_flujo" className="block text-sm font-medium text-slate-700">
          Tipo
        </label>
        <select
          id="tipo_flujo"
          name="tipo_flujo"
          value={tipoFlujo}
          onChange={(e) => handleTipoFlujoChange(e.target.value as TipoFlujo)}
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
        >
          <option value="Gasto">Gasto</option>
          <option value="Ingreso">Ingreso</option>
        </select>
      </div>

      {/* Categoría (filtrada por tipo) */}
      <div className="space-y-1">
        <label htmlFor="categoria_id" className="block text-sm font-medium text-slate-700">
          Categoría
        </label>
        <select
          id="categoria_id"
          name="categoria_id"
          value={categoriaId}
          onChange={(e) => setCategoriaId(Number(e.target.value))}
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
        >
          {categoriasFiltradas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      </div>

      {/* Concepto */}
      <div className="space-y-1">
        <label htmlFor="concepto" className="block text-sm font-medium text-slate-700">
          Concepto
        </label>
        <input
          id="concepto"
          name="concepto"
          type="text"
          value={concepto}
          onChange={(e) => setConcepto(e.target.value)}
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
          aria-invalid={Boolean(errors.concepto)}
          aria-describedby={errors.concepto ? 'concepto-error' : undefined}
        />
        {errors.concepto ? (
          <p id="concepto-error" role="alert" className="text-sm text-red-600">
            {errors.concepto}
          </p>
        ) : null}
      </div>

      {/* Frecuencia */}
      <div className="space-y-1">
        <label htmlFor="frecuencia" className="block text-sm font-medium text-slate-700">
          Frecuencia
        </label>
        <select
          id="frecuencia"
          name="frecuencia"
          value={frecuencia}
          onChange={(e) => setFrecuencia(e.target.value as Frecuencia)}
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
        >
          {FRECUENCIAS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </div>

      {/* Comportamiento is always editable so Ingreso rows can be classified
          as Fijo/Variable. Naturaleza stays Gasto-only: it is semantically
          meaningless for income — the cross-column CHECK in the schema also
          requires it only on Gasto. */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label htmlFor="comportamiento" className="block text-sm font-medium text-slate-700">
            Comportamiento
          </label>
          <select
            id="comportamiento"
            name="comportamiento"
            value={comportamiento}
            onChange={(e) => setComportamiento(e.target.value as Comportamiento)}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
          >
            {COMPORTAMIENTOS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {tipoFlujo === 'Gasto' ? (
          <div className="space-y-1">
            <label
              htmlFor="naturaleza_necesidad"
              className="block text-sm font-medium text-slate-700"
            >
              Naturaleza
            </label>
            <select
              id="naturaleza_necesidad"
              name="naturaleza_necesidad"
              value={naturaleza}
              onChange={(e) => setNaturaleza(e.target.value as NaturalezaNecesidad)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
            >
              {NATURALEZAS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      {/* Valor (input monetario localized) */}
      <div className="space-y-1">
        <label htmlFor="valor" className="block text-sm font-medium text-slate-700">
          Valor (en pesos)
        </label>
        <input
          id="valor"
          name="valor"
          type="text"
          inputMode="decimal"
          value={valorRaw}
          onChange={(e) => setValorRaw(e.target.value)}
          placeholder="1.500.000,50"
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
          aria-invalid={Boolean(errors.valor)}
          aria-describedby={errors.valor ? 'valor-error' : undefined}
        />
        {errors.valor ? (
          <p id="valor-error" role="alert" className="text-sm text-red-600">
            {errors.valor}
          </p>
        ) : null}
      </div>

      <button
        type="submit"
        className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2"
      >
        Guardar
      </button>
    </form>
  )
}
