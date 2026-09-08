// SelectorPerfil — organism de Atomic Design para el selector de
// perfil al abrir la aplicación (REQ-501) + gestión de perfiles
// (REQ-V2-102).
//
// Ver `design.md` §7 (capa React, Atomic Design) + §11 (sección
// multi-profile). La responsabilidad del organism es DUMB: recibe la
// lista de perfiles ya cargada por el padre, los renderiza como una
// lista clickeable, y delega la selección al callback `onSeleccionar`.
// El botón "Crear perfil nuevo" siempre se renderiza — la lógica de
// creación (modal / form inline / IPC) vive en `App.tsx`.
//
// REQ-V2-102: when `onRenombrar` and `onEliminar` are provided, each
// profile row renders "Renombrar" and "Eliminar" action buttons.
// Rename uses an inline text input with a "Guardar" confirm button.
//
// ## Contrato de `data-testid` (binding con el test file)
//
//   * `selector-perfil`              — root container (full-screen overlay)
//   * `selector-perfil-cargando`     — placeholder mientras `cargando=true`
//   * `opcion-perfil`               — each row in the profile list
//   * `boton-crear-perfil`          — the "create new profile" button
//   * `boton-renombrar-perfil`      — rename action button (per row)
//   * `boton-eliminar-perfil`       — delete action button (per row)
//   * `input-renombrar-perfil`      — inline rename text input
//   * `boton-guardar-renombrar`     — confirm rename button
//
// ## Estilo
//
// V3 Dark Mode: bg-zinc-900 (overlay), bg-zinc-800 (cards/inputs),
// text-slate-100/300/400, border-white/10. Salmon accent (#f05454)
// for primary action buttons (Guardar rename, Crear confirm).
// Mismo set que los otros organisms del dashboard V3.

import { useState } from 'react'
import type { UsuarioDto } from '../../data/tauri-commands'
import { formatCentavos } from '../../domain/precision/money'

interface SelectorPerfilProps {
  perfiles: UsuarioDto[]
  onSeleccionar: (id: number) => void
  cargando: boolean
  onRenombrar?: (id: number, nuevoNombre: string) => void
  onEliminar?: (id: number) => void
  onCrear?: (nombre: string) => void
}

export function SelectorPerfil({
  perfiles,
  onSeleccionar,
  cargando,
  onRenombrar,
  onEliminar,
  onCrear,
}: SelectorPerfilProps): JSX.Element {
  // Inline rename state: which profile id is being renamed, and the
  // current value of the text input.
  const [renombrandoId, setRenombrandoId] = useState<number | null>(null)
  const [renombrandoValor, setRenombrandoValor] = useState('')

  // Inline create state: whether the create form is open and the
  // current value of the name input.
  const [creando, setCreando] = useState(false)
  const [creandoValor, setCreandoValor] = useState('')

  const showActions = onRenombrar !== undefined && onEliminar !== undefined

  if (cargando) {
    return (
      <div
        data-testid="selector-perfil-cargando"
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-100 dark:bg-zinc-900"
      >
        <p className="text-sm text-slate-500 dark:text-slate-400">Cargando perfiles…</p>
      </div>
    )
  }

  const handleStartRename = (perfil: UsuarioDto): void => {
    setRenombrandoId(perfil.id)
    setRenombrandoValor(perfil.nombre)
  }

  const handleConfirmRename = (): void => {
    if (renombrandoId !== null && onRenombrar) {
      onRenombrar(renombrandoId, renombrandoValor)
    }
    setRenombrandoId(null)
    setRenombrandoValor('')
  }

  const handleStartCreate = (): void => {
    setCreando(true)
    setCreandoValor('')
  }

  const handleConfirmCreate = (): void => {
    if (creandoValor.trim() !== '' && onCrear) {
      onCrear(creandoValor.trim())
    }
    setCreando(false)
    setCreandoValor('')
  }

  const handleCancelCreate = (): void => {
    setCreando(false)
    setCreandoValor('')
  }

  return (
    <div
      data-testid="selector-perfil"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-100 dark:bg-zinc-900 p-8"
    >
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">¿Quién eres?</h1>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Elegí un perfil existente o creá uno nuevo.</p>

      <ul className="mt-8 w-full max-w-md space-y-2">
        {perfiles.map((p) => (
          <li key={p.id}>
            {renombrandoId === p.id ? (
              /* Inline rename mode */
              <div className="flex items-center gap-2 rounded-md border border-slate-200 dark:border-white/10 bg-white dark:bg-zinc-800 p-4 shadow-sm">
                <input
                  type="text"
                  data-testid="input-renombrar-perfil"
                  value={renombrandoValor}
                  onInput={(e) => setRenombrandoValor((e.target as HTMLInputElement).value)}
                  className="flex-1 rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-zinc-900 px-2 py-1 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-slate-300 dark:focus:border-white/30"
                />
                <button
                  type="button"
                  data-testid="boton-guardar-renombrar"
                  onClick={handleConfirmRename}
                  className="rounded bg-[#f05454] px-3 py-1 text-xs text-white hover:bg-[#d94444]"
                >
                  Guardar
                </button>
              </div>
            ) : (
              /* Normal profile row */
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  data-testid="opcion-perfil"
                  onClick={() => onSeleccionar(p.id)}
                  className="flex-1 rounded-md border border-slate-200 dark:border-white/10 bg-white dark:bg-zinc-800 p-4 text-left shadow-sm hover:border-slate-300 dark:hover:border-white/30 hover:bg-slate-50 dark:hover:bg-zinc-700 focus:outline-none transition-colors duration-150"
                >
                  <div className="text-base font-medium text-slate-900 dark:text-slate-100">{p.nombre}</div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Salario objetivo: {formatCentavos(p.salario_personal_objetivo_centavos)}
                  </div>
                </button>
                {showActions && (
                  <>
                    <button
                      type="button"
                      data-testid="boton-renombrar-perfil"
                      onClick={() => handleStartRename(p)}
                      className="rounded border border-slate-200 dark:border-white/10 px-2 py-1 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors duration-150"
                    >
                      Renombrar
                    </button>
                    <button
                      type="button"
                      data-testid="boton-eliminar-perfil"
                      onClick={() => onEliminar(p.id)}
                      className="rounded border border-red-200 dark:border-red-900/50 px-2 py-1 text-xs text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors duration-150"
                    >
                      Eliminar
                    </button>
                  </>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>

      {creando ? (
        <div className="mt-6 flex items-center gap-2 w-full max-w-md">
          <input
            type="text"
            data-testid="input-crear-perfil"
            placeholder="Nombre del nuevo perfil"
            value={creandoValor}
            onInput={(e) => setCreandoValor((e.target as HTMLInputElement).value)}
            className="flex-1 rounded border border-slate-200 dark:border-white/10 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-slate-300 dark:focus:border-white/30"
          />
          <button
            type="button"
            data-testid="boton-confirmar-crear-perfil"
            onClick={handleConfirmCreate}
            disabled={creandoValor.trim() === ''}
            className="rounded bg-[#f05454] px-3 py-2 text-xs text-white hover:bg-[#d94444] disabled:opacity-40"
          >
            Crear
          </button>
          <button
            type="button"
            data-testid="boton-cancelar-crear-perfil"
            onClick={handleCancelCreate}
            className="rounded border border-slate-200 dark:border-white/10 px-3 py-2 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors duration-150"
          >
            Cancelar
          </button>
        </div>
      ) : (
        <button
          type="button"
          data-testid="boton-crear-perfil"
          onClick={onCrear !== undefined ? handleStartCreate : undefined}
          className="mt-6 rounded-md border border-slate-200 dark:border-white/10 bg-white dark:bg-zinc-800 px-4 py-2 text-sm font-medium text-slate-800 dark:text-slate-100 hover:border-slate-300 dark:hover:border-white/30 hover:bg-slate-50 dark:hover:bg-zinc-700 transition-colors duration-150 disabled:opacity-40"
        >
          Crear perfil nuevo
        </button>
      )}
    </div>
  )
}
