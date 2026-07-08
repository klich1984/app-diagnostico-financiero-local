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
// Slice 8 WIRE: surface the saved transactions through the
// `ListaTransacciones` organism (REQ-202), with a per-row delete
// action that confirms with the user and calls `eliminarTransaccion()`
// (wraps `cmd_eliminar_transaccion`). After every successful insert
// OR delete we refetch the list so the table stays in sync with SQLite.
//
// Slice 9 WIRE (REQ-501): selector de perfil al abrir la app. La
// persistencia del perfil activo es local (WebView `localStorage`),
// mientras que la resolución del `usuario_id` para `insertarTransaccion`
// sigue viviendo en el backend (sigue resolviendo por 'Yo' — el selector
// sólo cambia el chip "Perfil activo:" del header, la lógica de
// aislamiento por perfil se cablea en un slice futuro). El comando
// `cmd_obtener_perfiles` ya existe y se invoca al montar.
//
// The old `CATEGORIAS_SEED` + plain `console.log` path is gone; the seed
// file (`src/data/categorias-seed.ts`) is intentionally KEPT as a fallback
// reference. The user explicitly requested keeping the `console.log` for
// debugging — there are 4 of them, see below.

import { useEffect, useState } from 'react'
import {
  eliminarTransaccion,
  insertarTransaccion,
  listarTransacciones,
  obtenerCategorias,
  obtenerPerfiles,
  type CategoriaDto,
  type TransaccionCompletaDto,
  type TransaccionInputDto,
  type UsuarioDto,
} from './data/tauri-commands'
import { obtenerPerfilActivo, guardarPerfilActivo } from './data/perfil-activo'
import { TransaccionForm, type TransaccionInput } from './components/molecules/TransaccionForm'
import { ListaTransacciones } from './components/organisms/ListaTransacciones'
import { SelectorPerfil } from './components/organisms/SelectorPerfil'

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

  // Slice 8: estado de la lista de transacciones persistidas.
  const [transacciones, setTransacciones] = useState<TransaccionCompletaDto[]>([])
  const [cargandoTransacciones, setCargandoTransacciones] = useState(true)

  // Slice 9: estado del selector multi-perfil.
  //   * `perfilActivo` se hidrata desde `localStorage` (sincrónico al
  //     montar) para decidir si mostramos el selector o el chip del
  //     header en el primer render.
  //   * `perfiles` lo carga el `cmd_obtener_perfiles` al montar.
  //   * `mostrarSelector` permite volver a abrir el selector desde el
  //     chip "Cambiar perfil".
  const [perfilActivo, setPerfilActivo] = useState<number | null>(obtenerPerfilActivo())
  const [perfiles, setPerfiles] = useState<UsuarioDto[]>([])
  const [cargandoPerfiles, setCargandoPerfiles] = useState(true)
  const [mostrarSelector, setMostrarSelector] = useState(false)

  // Reset del form post-submit: bumpeamos un counter y lo pasamos como
  // `key` al `TransaccionForm`. React desmonta el instance anterior y
  // monta uno nuevo con estado inicial — la forma idiomática de resetear
  // estado interno de un molecule sin agregarle una API de `reset()`.
  // Sin esto, el form retiene los valores del submit recién hecho y la
  // siguiente entrada arranca pre-llenada (bug UX).
  const [formKey, setFormKey] = useState<number>(0)

  // Slice 8: refetch helper. Reutilizado en mount + post-insert + post-delete.
  // El flag `cancelado` evita `setState` si el componente se desmonta
  // mientras la promesa está en vuelo (cleanup del `useEffect`).
  const refetchTransacciones = async (cancelado: { v: boolean } = { v: false }): Promise<void> => {
    setCargandoTransacciones(true)
    try {
      const txs = await listarTransacciones()
      if (!cancelado.v) {
        setTransacciones(txs)
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Error cargando transacciones:', e)
    } finally {
      if (!cancelado.v) {
        setCargandoTransacciones(false)
      }
    }
  }

  // Slice 9: carga inicial de perfiles desde la DB (REQ-501).
  // Se usa para mostrar el nombre del perfil activo en el chip del
  // header. Si el IPC falla, caemos en el array vacío y el selector
  // se mostrará igual (aunque sin opciones más allá del "crear
  // nuevo").
  const cargarPerfiles = async (): Promise<void> => {
    setCargandoPerfiles(true)
    try {
      const ps = await obtenerPerfiles()
      // Defensa: si el mock (en tests) o un bug del IPC devuelve algo
      // no-array, caemos a `[]` para no romper el render del selector
      // (`perfiles.map(...)`).
      setPerfiles(Array.isArray(ps) ? ps : [])
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Error cargando perfiles:', e)
      setPerfiles([])
    } finally {
      setCargandoPerfiles(false)
    }
  }

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

  // Slice 8: carga inicial de transacciones del perfil activo.
  useEffect(() => {
    const cancelado = { v: false }
    refetchTransacciones(cancelado)
    return () => {
      cancelado.v = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Slice 9: carga inicial de perfiles al montar.
  useEffect(() => {
    void cargarPerfiles()
  }, [])

  // Slice 9: handler de selección de perfil. Persiste el id en
  // localStorage y oculta el overlay.
  const handleSeleccionarPerfil = (id: number): void => {
    guardarPerfilActivo(id)
    setPerfilActivo(id)
    setMostrarSelector(false)
    // eslint-disable-next-line no-console
    console.log('Perfil seleccionado:', id)
  }

  // Slice 9: handler "Cambiar perfil" desde el chip del header.
  const handleCambiarPerfil = (): void => {
    setMostrarSelector(true)
  }

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
      // Slice 8: refrescar la lista para mostrar la fila recién creada.
      await refetchTransacciones()
      // Reset del form: bump del `key` fuerza remount con estado inicial.
      setFormKey((k) => k + 1)
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Error persistiendo transacción:', e)
      setErrorSubmit(String(e))
      setEstadoSubmit('error')
    }
  }

  // Slice 8: handler de eliminar. Confirmación nativa + IPC + refetch.
  const handleEliminar = async (id: number): Promise<void> => {
    if (!window.confirm('¿Eliminar esta transacción?')) return
    try {
      await eliminarTransaccion(id)
      // eslint-disable-next-line no-console
      console.log('Transaccion eliminada:', id)
      await refetchTransacciones()
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Error eliminando:', e)
    }
  }

  // Slice 9: nombre del perfil activo para mostrar en el chip del header.
  const perfilActivoNombre =
    perfilActivo !== null
      ? perfiles.find((p) => p.id === perfilActivo)?.nombre ?? `#${perfilActivo}`
      : null

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <section className="mx-auto max-w-2xl">
        <h1 className="mb-2 text-3xl font-bold text-slate-900">Diagnostico Financiero Local</h1>
        <p className="mb-8 text-slate-600">
          Aplicación local-first para gestión financiera personal.
        </p>

        {/* Slice 9: chip del perfil activo (visible cuando hay perfil
            activo y NO se está cambiando). */}
        {perfilActivo !== null && !mostrarSelector ? (
          <div
            data-testid="perfil-activo-chip"
            className="mb-4 flex items-center justify-between rounded-md border border-slate-200 bg-white p-3"
          >
            <span className="text-sm text-slate-600">
              Perfil activo: <strong>{perfilActivoNombre}</strong>
            </span>
            <button
              type="button"
              onClick={handleCambiarPerfil}
              className="text-xs text-slate-700 underline"
            >
              Cambiar perfil
            </button>
          </div>
        ) : null}

        <div className="rounded-lg bg-white p-6 shadow">
          <h2 className="mb-4 text-xl font-semibold text-slate-800">Nueva transacción</h2>
          <TransaccionForm key={formKey} categorias={categoriasParaForm} onSubmit={handleSubmit} />
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

        {/* Slice 8: lista de transacciones persistidas con acción eliminar. */}
        <div className="mt-8 rounded-lg bg-white p-6 shadow">
          <h2 className="mb-4 text-xl font-semibold text-slate-800">Transacciones</h2>
          <ListaTransacciones
            transacciones={transacciones}
            cargando={cargandoTransacciones}
            onEliminar={handleEliminar}
          />
        </div>

        <p className="mt-4 text-center text-sm text-slate-400">
          Épica 1 + Slices 2–9 · Wire IPC activo contra SQLite local
        </p>
      </section>

      {/* Slice 9: selector multi-perfil (REQ-501). Se muestra cuando NO
          hay perfil activo (primera vez) o cuando el usuario clickea
          "Cambiar perfil". */}
      {perfilActivo === null || mostrarSelector ? (
        <SelectorPerfil
          perfiles={perfiles}
          onSeleccionar={handleSeleccionarPerfil}
          cargando={cargandoPerfiles}
        />
      ) : null}
    </main>
  )
}

export default App
