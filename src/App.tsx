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

import { useEffect, useMemo, useRef, useState } from 'react'
import { Component, type ReactNode } from 'react'
import {
  actualizarTransaccion,
  crearPerfil,
  eliminarSimulacion,
  eliminarPerfil,
  eliminarTransaccion,
  actualizarSalarioObjetivo,
  insertarTransaccion,
  listarTransacciones,
  obtenerCategorias,
  obtenerPerfiles,
  obtenerSimulaciones,
  renombrarPerfil,
  upsertSimulacion,
  type CategoriaDto,
  type SimulacionCompletaDto,
  type TransaccionCompletaDto,
  type TransaccionInputDto,
  type UpsertSimulacionInput,
  type UsuarioDto,
} from './data/tauri-commands'
import { obtenerPerfilActivo, guardarPerfilActivo } from './data/perfil-activo'
import { TransaccionForm, type TransaccionInput } from './components/molecules/TransaccionForm'
import { ListaTransacciones } from './components/organisms/ListaTransacciones'
import { SelectorPerfil } from './components/organisms/SelectorPerfil'
import { MatrizPresupuesto } from './components/organisms/MatrizPresupuesto'
import { SimuladorPanel } from './components/organisms/SimuladorPanel'
import { PresupuestoMejoradoPanel } from './components/organisms/PresupuestoMejoradoPanel'
import { DistribucionChart } from './components/organisms/DistribucionChart'
import { calcularMatriz, type CategoriaMin } from './domain/agregaciones/matriz'
import { calcularMatrizMejorada } from './domain/simulador/matriz-mejorada'
import { calcularEstadoResultados, type EstadoResultados } from './domain/kpis'
import { EstadoResultadosPanel } from './components/organisms/EstadoResultadosPanel'
import {
  distribucionGastosPorCategoria,
  distribucionIngresosPorCategoria,
} from './domain/agregaciones/graficos'
import { exportarExcel } from './data/export-excel'
import { DashboardLayout } from './components/templates/DashboardLayout'
import { Sidebar } from './components/organisms/Sidebar'
import { RightDrawer } from './components/organisms/RightDrawer'
import type { TabActiva } from './types/tabs'

class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('App error boundary caught:', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-slate-50 p-8">
          <div className="mx-auto max-w-lg rounded-md border border-red-200 bg-white p-6">
            <h1 className="text-lg font-semibold text-red-700">Error</h1>
            <p className="mt-2 text-sm text-slate-700">{this.state.error.message}</p>
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="mt-4 rounded-md bg-slate-900 px-3 py-1 text-sm text-white"
            >
              Reintentar
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

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
  // Ref para limpiar el auto-dismiss del mensaje de éxito al desmontar.
  const submitSuccessTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  // Slice 10/11: tab activa en el shell de la app (REQ-301, REQ-302,
  // REQ-602).
  //   * 'transacciones' es el default — coincide con el comportamiento
  //     pre-Slice-10.
  //   * 'presupuesto' muestra la matriz de presupuesto con los totales
  //     agregados (REQ-301). Los charts (REQ-302) entran en otro slice.
  //   * 'simulador'  (Slice 11 / REQ-602) — tercer tab con el panel
  //     del Simulador (sliders + matriz mejorada).
  // El estado es local; no se persiste — al reabrir la app volvemos a
  // 'transacciones' (es el flujo principal del usuario).
  // V3 (Task 3.2–3.4): TabActiva ahora se importa desde src/types/tabs.ts
  // para que Sidebar también pueda consumirla sin dependencia circular.
  const [tabActiva, setTabActiva] = useState<TabActiva>('transacciones')

  const [salarioObjetivoCentavos, setSalarioObjetivoCentavos] = useState<number | null>(null)

  // Phase 3 (REQ-V2-103): toggle de modo mejorado. Estado local — no
  // se persiste por perfil en esta iteración (decisión de producto).
  // `false` = modo base (default); `true` = modo mejorado.
  const [modoMejorado, setModoMejorado] = useState(false)

  // Tech debt (v3-theme-toggle): toggle de tema Light/Dark Mode.
  // Default `true` = dark — mantiene el comportamiento existente en primera
  // carga; el `useEffect` sincroniza la clase `dark` en <html>.
  const [modoOscuro, setModoOscuro] = useState(true)

  useEffect(() => {
    if (modoOscuro) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [modoOscuro])

  // Slice 11: estado del panel del Simulador. Se carga cuando cambia
  // el perfil activo (no al montar — el selector ya filtró por perfil).
  const [simulaciones, setSimulaciones] = useState<SimulacionCompletaDto[]>([])
  const [cargandoSimulaciones, setCargandoSimulaciones] = useState(true)

  const estadoResultado = useMemo<EstadoResultados | null>(() => {
    if (transacciones.length === 0) return null
    return calcularEstadoResultados(
      transacciones as never,
      categorias.map((c) => ({
        ...c,
        grupo_pertenencia: c.grupo_pertenencia.toUpperCase() === 'INGRESO' ? 'INGRESO' : 'GASTO',
      })) as never,
      simulaciones as never,
      salarioObjetivoCentavos,
    )
  }, [transacciones, categorias, simulaciones, salarioObjetivoCentavos])

  // Slice 10: matriz de presupuesto derivada de las transacciones
  // cargadas. `useMemo` evita recalcularla en cada render — sólo se
  // recomputa cuando cambian las transacciones o el catálogo de
  // categorías. El cálculo vive en `domain/agregaciones/matriz.ts`
  // (puro, sin React), así que sólo cambiamos la frecuencia de
  // invocación acá.
  const matriz = useMemo(() => {
    // El agregador espera `CategoriaMin` (keys TitleCase para
    // `grupo_pertenencia`); el DTO del IPC ya viene TitleCase, así
    // que el casteo es directo.
    const catsMin: CategoriaMin[] = categorias.map((c) => ({
      id: c.id,
      nombre: c.nombre,
      grupo_pertenencia: c.grupo_pertenencia.toUpperCase() === 'INGRESO' ? 'INGRESO' : 'GASTO',
    }))
    return calcularMatriz(transacciones, catsMin)
  }, [transacciones, categorias])

  // Phase 3 (REQ-V2-103): matriz mejorada para el tab Presupuesto
  // cuando modoMejorado está activo. Reutiliza la misma normalización
  // de categorías que `matriz` para mantener paridad de fórmulas.
  const matrizMejorada = useMemo(() => {
    const catsMin: CategoriaMin[] = categorias.map((c) => ({
      id: c.id,
      nombre: c.nombre,
      grupo_pertenencia: c.grupo_pertenencia.toUpperCase() === 'INGRESO' ? 'INGRESO' : 'GASTO',
    }))
    return calcularMatrizMejorada(transacciones, catsMin, simulaciones)
  }, [transacciones, categorias, simulaciones])

  // Slice 13 (REQ-302): distribuciones porcentuales para alimentar los
  // dos `DistribucionChart` que viven debajo de la matriz en la pestaña
  // Presupuesto. Mismo casteo DTO → `CategoriaMin` que `matriz`:
  // `grupo_pertenencia` se normaliza a 'INGRESO' | 'GASTO' (uppercase)
  // porque así lo espera `domain/agregaciones/graficos`. Los `as never`
  // evitan que TypeScript se queje del shape del DTO completo (que trae
  // campos extra irrelevantes para el agregador).
  const distribucionIngresos = useMemo(
    () =>
      distribucionIngresosPorCategoria(
        transacciones as never,
        categorias.map((c) => ({
          ...c,
          grupo_pertenencia: c.grupo_pertenencia.toUpperCase() === 'INGRESO' ? 'INGRESO' : 'GASTO',
        })) as never,
      ),
    [transacciones, categorias],
  )

  const distribucionGastos = useMemo(
    () =>
      distribucionGastosPorCategoria(
        transacciones as never,
        categorias.map((c) => ({
          ...c,
          grupo_pertenencia: c.grupo_pertenencia.toUpperCase() === 'INGRESO' ? 'INGRESO' : 'GASTO',
        })) as never,
      ),
    [transacciones, categorias],
  )

  // Reset del form post-submit: bumpeamos un counter y lo pasamos como
  // `key` al `TransaccionForm`. React desmonta el instance anterior y
  // monta uno nuevo con estado inicial — la forma idiomática de resetear
  // estado interno de un molecule sin agregarle una API de `reset()`.
  // Sin esto, el form retiene los valores del submit recién hecho y la
  // siguiente entrada arranca pre-llenada (bug UX).
  const [formKey, setFormKey] = useState<number>(0)

  // Slice 12 (REQ-V2-101): transacción en edición. `null` = modo creación.
  const [transaccionEditando, setTransaccionEditando] = useState<TransaccionCompletaDto | null>(
    null,
  )

  // V3 (Task 3.1): estado de visibilidad del RightDrawer. `false` = cerrado (default).
  // Se abre automáticamente cuando el usuario hace click en «Editar» sobre una
  // transacción (handleEditar) y se cierra con el botón de cerrar del drawer.
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false)

  // BF-delete: ID de la transacción pendiente de confirmación de eliminación.
  // `null` = no hay confirmación activa. Usamos React state en lugar de
  // `window.confirm` porque Tauri WebViews bloquean los diálogos nativos del browser
  // y el confirm devuelve `true` instantáneamente sin mostrar nada al usuario.
  const [idAEliminar, setIdAEliminar] = useState<number | null>(null)

  // Slice 8: refetch helper. Reutilizado en mount + post-insert + post-delete.
  // El flag `cancelado` evita `setState` si el componente se desmonta
  // mientras la promesa está en vuelo (cleanup del `useEffect`).
  const refetchTransacciones = async (cancelado: { v: boolean } = { v: false }): Promise<void> => {
    if (perfilActivo === null) {
      setTransacciones([])
      setCargandoTransacciones(false)
      return
    }
    setCargandoTransacciones(true)
    try {
      const txs = await listarTransacciones(perfilActivo)
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

  // Slice 11: refetch helper para las propuestas del Simulador.
  // Idem `refetchTransacciones`: se reusa post-upsert + post-eliminar.
  // El guard `perfilActivo === null` evita golpear el backend antes de
  // que el usuario haya elegido perfil (REQ-501).
  const refetchSimulaciones = async (cancelado: { v: boolean } = { v: false }): Promise<void> => {
    if (perfilActivo === null) {
      setSimulaciones([])
      setCargandoSimulaciones(false)
      return
    }
    setCargandoSimulaciones(true)
    try {
      const sims = await obtenerSimulaciones(perfilActivo)
      if (!cancelado.v) {
        setSimulaciones(Array.isArray(sims) ? sims : [])
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Error cargando simulaciones:', e)
    } finally {
      if (!cancelado.v) {
        setCargandoSimulaciones(false)
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

  // Slice 8 + 11: carga de transacciones del perfil activo. Se
  // re-dispara cuando cambia `perfilActivo` para que el aislamiento
  // REQ-501 + REQ-603 se respete tanto para las transacciones como
  // para las propuestas del Simulador.
  useEffect(() => {
    const cancelado = { v: false }
    refetchTransacciones(cancelado)
    refetchSimulaciones(cancelado)
    return () => {
      cancelado.v = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfilActivo])

  // Slice 9: carga inicial de perfiles al montar.
  useEffect(() => {
    void cargarPerfiles()
  }, [])

  useEffect(() => {
    if (perfilActivo === null) {
      setSalarioObjetivoCentavos(null)
      return
    }
    const perfil = perfiles.find((p) => p.id === perfilActivo)
    setSalarioObjetivoCentavos(perfil?.salario_personal_objetivo_centavos ?? null)
  }, [perfilActivo, perfiles])

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

  // Task 2.4 (REQ-V2-102): rename a profile and refresh the list.
  const handleRenombrarPerfil = async (id: number, nuevoNombre: string): Promise<void> => {
    try {
      await renombrarPerfil(id, nuevoNombre)
      await cargarPerfiles()
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Error renombrando perfil:', e)
    }
  }

  // Task 2.4 (REQ-V2-102): delete a profile.
  // Guard: the active profile cannot be deleted — the user must switch
  // first. A native confirm protects against accidental clicks.
  const handleEliminarPerfil = async (id: number): Promise<void> => {
    if (id === perfilActivo) {
      window.alert('No se puede eliminar el perfil activo. Cambiá de perfil primero.')
      return
    }
    if (!window.confirm('¿Eliminar este perfil? Esta acción no se puede deshacer.')) return
    try {
      await eliminarPerfil(id)
      await cargarPerfiles()
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Error eliminando perfil:', e)
    }
  }

  // Task 2.4 (REQ-V2-102): create a new profile and auto-select it.
  // Salary defaults to 0 — the user can update it later from the
  // Resultados tab (ModalSalarioObjetivo).
  const handleCrearPerfil = async (nombre: string): Promise<void> => {
    try {
      const id = await crearPerfil({ nombre, salario_personal_objetivo_centavos: 0 })
      await cargarPerfiles()
      guardarPerfilActivo(id)
      setPerfilActivo(id)
      setMostrarSelector(false)
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Error creando perfil:', e)
    }
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
      if (perfilActivo === null) throw new Error('No hay perfil activo')

      const payload: TransaccionInputDto = {
        ...t,
        usuario_id: perfilActivo,
      }

      const id = await insertarTransaccion(payload)
      // eslint-disable-next-line no-console
      console.log('Transaccion persistida con id:', id)
      setIdInsertado(id)
      setEstadoSubmit('ok')
      // Bug fix (Bug 3): auto-dismiss the success message after 3 s.
      // Cancela cualquier timer previo para evitar race conditions si el
      // usuario envía dos forms en rápida sucesión.
      if (submitSuccessTimeout.current !== null) {
        clearTimeout(submitSuccessTimeout.current)
      }
      submitSuccessTimeout.current = setTimeout(() => {
        setEstadoSubmit('idle')
        submitSuccessTimeout.current = null
      }, 3000)
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

  // Slice 8: handler de eliminar. Abre el modal de confirmación React en lugar
  // de `window.confirm` — los WebViews de Tauri bloquean los diálogos nativos
  // del browser, por lo que `window.confirm` retorna `true` inmediatamente sin
  // mostrar ninguna UI al usuario. La eliminación efectiva ocurre en el handler
  // del botón «Eliminar» del modal (`idAEliminar` state).
  const handleEliminar = (id: number): void => {
    setIdAEliminar(id)
  }

  // Slice 12 (REQ-V2-101): handler de editar. Carga la transacción en el
  // form sin IPC — los datos ya están en `transacciones`.
  // V3 (Task 3.1): abre el RightDrawer automáticamente al iniciar la edición.
  // El scroll ya no aplica porque el form vive dentro del drawer lateral.
  const handleEditar = (id: number): void => {
    const tx = transacciones.find((t) => t.id === id) ?? null
    setTransaccionEditando(tx)
    setDrawerOpen(true)
  }

  // V3 (Task 3.1): cierra el RightDrawer y vuelve al modo creación.
  const handleCerrarDrawer = (): void => {
    setDrawerOpen(false)
    setTransaccionEditando(null)
    setFormKey((k) => k + 1)
  }

  // Slice 12 (REQ-V2-101): handler de guardar edición. Llama al IPC de
  // update, refresca la lista y vuelve al modo creación.
  const handleGuardarEdicion = async (input: TransaccionInput): Promise<void> => {
    if (transaccionEditando === null || perfilActivo === null) return
    try {
      await actualizarTransaccion({
        id: transaccionEditando.id,
        usuarioId: perfilActivo,
        input: input as TransaccionInputDto,
      })
      // eslint-disable-next-line no-console
      console.log('Transaccion actualizada:', transaccionEditando.id)
      setTransaccionEditando(null)
      setFormKey((k) => k + 1)
      await refetchTransacciones()
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Error actualizando transacción:', e)
    }
  }

  // Slice 12 (REQ-V2-101): handler de cancelar edición.
  const handleCancelarEdicion = (): void => {
    setTransaccionEditando(null)
    setFormKey((k) => k + 1)
  }

  // Slice 11: handler de upsert de propuesta del Simulador.
  // El panel ya hace el debounce de 300 ms — acá sólo recibimos el
  // último valor propuesto por el usuario. Refetch al final para que
  // el state local refleje el id autoincrement + updated_at.
  const handleUpsertSimulacion = async (input: UpsertSimulacionInput): Promise<void> => {
    try {
      const id = await upsertSimulacion(input)
      // eslint-disable-next-line no-console
      console.log('Simulacion upsert:', id)
      await refetchSimulaciones()
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Error upsert simulacion:', e)
    }
  }

  // Slice 11: handler de eliminar propuesta del Simulador. Sin
  // confirmación nativa porque la acción es reversible (se puede
  // mover el slider de nuevo) y barata.
  const handleEliminarSimulacion = async (transaccionId: number): Promise<void> => {
    try {
      await eliminarSimulacion(transaccionId)
      // eslint-disable-next-line no-console
      console.log('Simulacion eliminada:', transaccionId)
      await refetchSimulaciones()
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Error eliminando simulacion:', e)
    }
  }

  // Slice 9: nombre del perfil activo para mostrar en el chip del header.
  const perfilActivoNombre =
    perfilActivo !== null
      ? (perfiles.find((p) => p.id === perfilActivo)?.nombre ?? `#${perfilActivo}`)
      : null

  return (
    <AppErrorBoundary>
      <DashboardLayout
        drawerOpen={drawerOpen}
        sidebar={
          <Sidebar
            tabActiva={tabActiva}
            onTabChange={setTabActiva}
            perfilActivoNombre={perfilActivoNombre}
            modoMejorado={modoMejorado}
            onToggleModoMejorado={() => setModoMejorado((m) => !m)}
            modoOscuro={modoOscuro}
            onToggleTema={() => setModoOscuro((m) => !m)}
            onExportarExcel={async () => {
              try {
                const path = await exportarExcel(transacciones, estadoResultado)
                // Bug fix (Bug 1): solo alertamos si el usuario no canceló
                // el diálogo nativo. exportarExcel devuelve null en cancelación.
                if (path) {
                  alert('Archivo Excel exportado correctamente.')
                }
              } catch (e) {
                console.error('Error exportando Excel:', e)
                alert('Error exportando Excel. Revisa la consola.')
              }
            }}
            selectorPerfilSlot={
              <button
                type="button"
                onClick={handleCambiarPerfil}
                className="mt-1 w-full rounded-md px-3 py-1 text-left text-xs text-slate-500 dark:text-slate-500 transition-colors duration-150 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-800 dark:hover:text-slate-300"
              >
                Cambiar perfil
              </button>
            }
          />
        }
        main={
          <div className="flex h-full flex-col p-6">
            {/* Bug fix: trigger button for creating new transactions.
                The TransaccionForm lives inside RightDrawer; without this
                button there is no way for the user to open a blank form
                (handleEditar only covers the edit path). Salmon accent
                matches the V3 Dark Mode palette (tailwind.config.js). */}
            <div className="mb-4 flex items-center justify-between">
              <button
                type="button"
                data-testid="btn-nueva-transaccion"
                onClick={() => {
                  setTransaccionEditando(null)
                  setDrawerOpen(true)
                }}
                className="rounded-md bg-[#f05454] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#d94444] focus:outline-none focus:ring-2 focus:ring-[#f05454] focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-zinc-950"
              >
                + Nueva Transacción
              </button>
            </div>

            {/* REQ-V2-103: aviso global cuando modo mejorado está activo
                pero no hay simulaciones cargadas. */}
            {modoMejorado && simulaciones.length === 0 ? (
              <div
                data-testid="aviso-modo-mejorado-sin-simulaciones"
                className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
              >
                Modo mejorado activo, pero no hay simulaciones guardadas. Andá al Simulador para
                proponer mejoras.
              </div>
            ) : null}

            {/* Slice 10: vistas centrales según tab activa (REQ-301, REQ-302).
                Las tabs se renderizan en el shell de la app independientemente
                de si hay perfil activo o no — el `SelectorPerfil` es un overlay
                full-screen (`fixed inset-0 z-50`) que cubre visualmente el
                contenido cuando el usuario aún no eligió perfil. Esto permite
                que los tests del shell (`App.test.tsx`) puedan queryar las tabs
                sin tener que simular primero la selección de perfil. */}
            {tabActiva === 'transacciones' ? (
              <ListaTransacciones
                transacciones={transacciones}
                cargando={cargandoTransacciones}
                onEliminar={handleEliminar}
                onEditar={handleEditar}
              />
            ) : null}
            {tabActiva === 'presupuesto' ? (
              <>
                {/* REQ-V2-103: when modo mejorado is on and sims exist,
                    show the improved matrix; otherwise base. */}
                <MatrizPresupuesto
                  matriz={modoMejorado && simulaciones.length > 0 ? matrizMejorada : matriz}
                />
                <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <DistribucionChart
                    distribucion={distribucionIngresos}
                    titulo="Distribución de Ingresos"
                  />
                  <DistribucionChart
                    distribucion={distribucionGastos}
                    titulo="Distribución de Gastos"
                  />
                </div>
              </>
            ) : null}
            {tabActiva === 'simulador' ? (
              <SimuladorPanel
                transacciones={transacciones}
                categorias={categorias}
                simulaciones={simulaciones}
                cargando={cargandoSimulaciones}
                onUpsert={handleUpsertSimulacion}
                onEliminar={handleEliminarSimulacion}
              />
            ) : null}
            {tabActiva === 'presupuesto-mejorado' && perfilActivo !== null ? (
              <PresupuestoMejoradoPanel
                transacciones={transacciones}
                categorias={categorias}
                simulaciones={simulaciones}
                onIrATransacciones={() => setTabActiva('transacciones')}
              />
            ) : null}
            {tabActiva === 'resultados' ? (
              estadoResultado ? (
                <EstadoResultadosPanel
                  estado={estadoResultado}
                  salarioObjetivoCentavos={salarioObjetivoCentavos}
                  perfilActivoId={perfilActivo}
                  onSalarioGuardado={async (centavos) => {
                    if (perfilActivo === null) return
                    await actualizarSalarioObjetivo({
                      perfil_id: perfilActivo,
                      salario_objetivo_centavos: centavos,
                    })
                    setSalarioObjetivoCentavos(centavos)
                  }}
                />
              ) : (
                <p className="p-4 text-sm text-slate-500">Cargando estado de resultados…</p>
              )
            ) : null}
          </div>
        }
        drawer={
          <RightDrawer
            isOpen={drawerOpen}
            onClose={handleCerrarDrawer}
            titulo={transaccionEditando ? 'Editar transacción' : 'Nueva transacción'}
          >
            {/* Task 3.2: TransaccionForm dentro del slot drawer, preservando
                formKey, submit handlers y status panel. */}
            <TransaccionForm
              key={formKey}
              categorias={categoriasParaForm}
              onSubmit={transaccionEditando ? handleGuardarEdicion : handleSubmit}
              initialValue={transaccionEditando ?? undefined}
              onCancelar={transaccionEditando ? handleCancelarEdicion : undefined}
            />

            {/* Status panel: feedback inmediato al usuario sobre el submit. */}
            {estadoSubmit === 'guardando' ? (
              <p className="mt-4 text-sm text-slate-400">Guardando en SQLite…</p>
            ) : null}
            {estadoSubmit === 'ok' && idInsertado !== null ? (
              <p className="mt-4 text-sm text-green-400">Transacción guardada correctamente.</p>
            ) : null}
            {estadoSubmit === 'error' && errorSubmit !== null ? (
              <p className="mt-4 text-sm text-red-400">Error: {errorSubmit}</p>
            ) : null}
            {cargandoCategorias ? (
              <p className="mt-2 text-xs text-slate-500">Cargando categorías desde la DB…</p>
            ) : null}
            {errorCategorias !== null ? (
              <p className="mt-2 text-xs text-red-400">
                Error cargando categorías: {errorCategorias}
              </p>
            ) : null}
          </RightDrawer>
        }
      />

      {/* Task 3.4: SelectorPerfil se renderiza FUERA del DashboardLayout como
          overlay global `fixed inset-0 z-50`. Sin cambios en su lógica ni props.
          Slice 9: se muestra cuando NO hay perfil activo (primera vez) o cuando
          el usuario clickea «Cambiar perfil» desde el chip de la Sidebar. */}
      {perfilActivo === null || mostrarSelector ? (
        <SelectorPerfil
          perfiles={perfiles}
          onSeleccionar={handleSeleccionarPerfil}
          cargando={cargandoPerfiles}
          onRenombrar={handleRenombrarPerfil}
          onEliminar={handleEliminarPerfil}
          onCrear={handleCrearPerfil}
        />
      ) : null}

      {/* BF-delete: modal de confirmación de eliminación de transacción.
          Reemplaza `window.confirm` que Tauri WebViews bloquean silenciosamente.
          z-[100] para quedar por encima del SelectorPerfil (z-50). */}
      {idAEliminar !== null && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-white/10 p-6 rounded-lg shadow-xl max-w-sm w-full">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">Confirmar eliminación</h3>
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-6">
              ¿Estás seguro de que querés eliminar esta transacción? Esta acción no se puede
              deshacer.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIdAEliminar(null)}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  const id = idAEliminar
                  setIdAEliminar(null)
                  try {
                    await eliminarTransaccion(id)
                    // eslint-disable-next-line no-console
                    console.log('Transaccion eliminada:', id)
                    await refetchTransacciones()
                  } catch (e) {
                    // eslint-disable-next-line no-console
                    console.error('Error eliminando:', e)
                  }
                }}
                className="px-4 py-2 text-sm font-medium bg-red-100 dark:bg-red-900/80 text-red-700 dark:text-red-100 hover:bg-red-200 dark:hover:bg-red-900 rounded-md"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </AppErrorBoundary>
  )
}

export default App
