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
// Tailwind utility classes (mismo set que `TransaccionForm.tsx` y
// `ListaTransacciones.tsx`). Texto de UI: español neutro, sin voseo.

import { useState } from 'react'
import type { UsuarioDto } from '../../data/tauri-commands'
import { formatCentavos } from '../../domain/precision/money'

interface SelectorPerfilProps {
  perfiles: UsuarioDto[]
  onSeleccionar: (id: number) => void
  cargando: boolean
  onRenombrar?: (id: number, nuevoNombre: string) => void
  onEliminar?: (id: number) => void
}

export function SelectorPerfil({
  perfiles,
  onSeleccionar,
  cargando,
  onRenombrar,
  onEliminar,
}: SelectorPerfilProps): JSX.Element {
  // Inline rename state: which profile id is being renamed, and the
  // current value of the text input.
  const [renombrandoId, setRenombrandoId] = useState<number | null>(null)
  const [renombrandoValor, setRenombrandoValor] = useState('')

  const showActions = onRenombrar !== undefined && onEliminar !== undefined

  if (cargando) {
    return (
      <div
        data-testid="selector-perfil-cargando"
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-50"
      >
        <p className="text-sm text-slate-500">Cargando perfiles…</p>
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

  return (
    <div
      data-testid="selector-perfil"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-50 p-8"
    >
      <h1 className="text-2xl font-bold text-slate-900">¿Quién eres?</h1>
      <p className="mt-2 text-sm text-slate-600">
        Elegí un perfil existente o creá uno nuevo.
      </p>

      <ul className="mt-8 w-full max-w-md space-y-2">
        {perfiles.map((p) => (
          <li key={p.id}>
            {renombrandoId === p.id ? (
              /* Inline rename mode */
              <div className="flex items-center gap-2 rounded-md border border-slate-300 bg-white p-4 shadow-sm">
                <input
                  type="text"
                  data-testid="input-renombrar-perfil"
                  value={renombrandoValor}
                  onInput={(e) =>
                    setRenombrandoValor((e.target as HTMLInputElement).value)
                  }
                  className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm focus:outline-none"
                />
                <button
                  type="button"
                  data-testid="boton-guardar-renombrar"
                  onClick={handleConfirmRename}
                  className="rounded bg-slate-900 px-3 py-1 text-xs text-white hover:bg-slate-700"
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
                  className="flex-1 rounded-md border border-slate-300 bg-white p-4 text-left shadow-sm hover:border-slate-500 focus:outline-none"
                >
                  <div className="text-base font-medium text-slate-900">{p.nombre}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    Salario objetivo: {formatCentavos(p.salario_personal_objetivo_centavos)}
                  </div>
                </button>
                {showActions && (
                  <>
                    <button
                      type="button"
                      data-testid="boton-renombrar-perfil"
                      onClick={() => handleStartRename(p)}
                      className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
                    >
                      Renombrar
                    </button>
                    <button
                      type="button"
                      data-testid="boton-eliminar-perfil"
                      onClick={() => onEliminar(p.id)}
                      className="rounded border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
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

      <button
        type="button"
        data-testid="boton-crear-perfil"
        className="mt-6 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:border-slate-500"
      >
        Crear perfil nuevo
      </button>
    </div>
  )
}