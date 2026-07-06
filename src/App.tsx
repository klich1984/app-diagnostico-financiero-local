// App.tsx — root component for the desktop shell.
//
// Slice 7 WIRE: this is the first end-to-end integration that persists
// transactions to SQLite via the Tauri IPC bridge.
//
//   * On mount, we fetch the categories catalogue through
//     `obtenerCategorias()` (wraps `cmd_obtener_categorias`). The DB file
//     and its 14-row category seed are created on first IPC call by
//     `src-tauri/src/lib.rs` (`BaseDirectory::App` + migrations).
//   * The submit handler forwards the validated `TransaccionInput` to
//     `insertarTransaccion()` (wraps `cmd_insert_transaccion`) and shows
//     the resulting autoincrement id (or error) in a small status panel.
//
// The old `CATEGORIAS_SEED` + plain `console.log` path is gone; the seed
// file (`src/data/categorias-seed.ts`) is intentionally KEPT as a fallback
// reference. The user explicitly requested keeping the `console.log` for
// debugging — there are 4 of them, see below.

import { useEffect, useState } from 'react'
import {
  insertarTransaccion,
  obtenerCategorias,
  type CategoriaDto,
  type TransaccionInputDto,
} from './data/tauri-commands'
import { TransaccionForm, type TransaccionInput } from './components/molecules/TransaccionForm'

function App(): JSX.Element {
  const [categorias, setCategorias] = useState<CategoriaDto[]>([])
  const [cargandoCategorias, setCargandoCategorias] = useState(true)
  const [errorCategorias, setErrorCategorias] = useState<string | null>(null)

  // Mapeo DTO → shape que el form espera. `grupo_pertenencia` en el DTO
  // coincide 1-a-1 con `tipo_flujo` del form (TitleCase: 'Ingreso'|'Gasto').
  // Ver `tauri-commands.ts` `CategoriaDto` docblock.
  const categoriasParaForm = categorias.map((c) => ({
    id: c.id,
    nombre: c.nombre,
    tipo_flujo: c.grupo_pertenencia,
  }))

  const [estadoSubmit, setEstadoSubmit] = useState<'idle' | 'guardando' | 'ok' | 'error'>('idle')
  const [idInsertado, setIdInsertado] = useState<number | null>(null)
  const [errorSubmit, setErrorSubmit] = useState<string | null>(null)

  // Carga inicial del catálogo de categorías. El `cancelado` flag evita
  // un `setState` si el componente se desmonta mientras la promesa está
  // en vuelo (cleanup del `useEffect`).
  useEffect(() => {
    let cancelado = false
    setCargandoCategorias(true)
    obtenerCategorias()
      .then((cats) => {
        if (!cancelado) {
          setCategorias(cats)
          setErrorCategorias(null)
        }
      })
      .catch((e) => {
        // eslint-disable-next-line no-console
        console.error('Error cargando categorías:', e)
        if (!cancelado) {
          setErrorCategorias(String(e))
        }
      })
      .finally(() => {
        if (!cancelado) setCargandoCategorias(false)
      })
    return () => {
      cancelado = true
    }
  }, [])

  // Handler de submit: cruza la frontera del form → IPC → SQLite.
  // Conservamos el `console.log` original (debugging explícito del
  // usuario) y agregamos 2 logs nuevos: éxito con id y error de IPC.
  const handleSubmit = async (t: TransaccionInput): Promise<void> => {
    // eslint-disable-next-line no-console
    console.log('Transaccion submitted (antes de IPC):', t)
    setEstadoSubmit('guardando')
    setErrorSubmit(null)
    setIdInsertado(null)
    try {
      const payload: TransaccionInputDto = t
      const id = await insertarTransaccion(payload)
      // eslint-disable-next-line no-console
      console.log('Transaccion persistida con id:', id)
      setIdInsertado(id)
      setEstadoSubmit('ok')
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Error persistiendo transacción:', e)
      setErrorSubmit(String(e))
      setEstadoSubmit('error')
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <section className="mx-auto max-w-2xl">
        <h1 className="mb-2 text-3xl font-bold text-slate-900">Diagnostico Financiero Local</h1>
        <p className="mb-8 text-slate-600">
          Aplicación local-first para gestión financiera personal.
        </p>

        <div className="rounded-lg bg-white p-6 shadow">
          <h2 className="mb-4 text-xl font-semibold text-slate-800">Nueva transacción</h2>
          <TransaccionForm categorias={categoriasParaForm} onSubmit={handleSubmit} />
        </div>

        {/* Status panel: feedback inmediato al usuario sobre el submit. */}
        {estadoSubmit === 'guardando' ? (
          <p className="mt-4 text-sm text-slate-500">Guardando en SQLite…</p>
        ) : null}
        {estadoSubmit === 'ok' && idInsertado !== null ? (
          <p className="mt-4 text-sm text-green-700">Guardado OK · id={idInsertado}</p>
        ) : null}
        {estadoSubmit === 'error' && errorSubmit !== null ? (
          <p className="mt-4 text-sm text-red-700">Error: {errorSubmit}</p>
        ) : null}
        {cargandoCategorias ? (
          <p className="mt-2 text-xs text-slate-400">Cargando categorías desde la DB…</p>
        ) : null}
        {errorCategorias !== null ? (
          <p className="mt-2 text-xs text-red-600">Error cargando categorías: {errorCategorias}</p>
        ) : null}

        <p className="mt-4 text-center text-sm text-slate-400">
          Épica 1 + Slices 2–7 · Wire IPC activo contra SQLite local
        </p>
      </section>
    </main>
  )
}

export default App
