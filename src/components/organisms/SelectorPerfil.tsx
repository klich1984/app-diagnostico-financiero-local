// SelectorPerfil — organism de Atomic Design para el selector de
// perfil al abrir la aplicación (REQ-501).
//
// Ver `design.md` §7 (capa React, Atomic Design) + §11 (sección
// multi-profile). La responsabilidad del organism es DUMB: recibe la
// lista de perfiles ya cargada por el padre, los renderiza como una
// lista clickeable, y delega la selección al callback `onSeleccionar`.
// El botón "Crear perfil nuevo" siempre se renderiza — la lógica de
// creación (modal / form inline / IPC) vive en `App.tsx`.
//
// ## Contrato de `data-testid` (binding con el test file)
//
//   * `selector-perfil`           — root container (full-screen overlay)
//   * `selector-perfil-cargando`  — placeholder mientras `cargando=true`
//   * `opcion-perfil`             — cada fila de la lista (1 por perfil)
//   * `boton-crear-perfil`        — botón "crear perfil nuevo"
//
// ## Estilo
//
// Tailwind utility classes (mismo set que `TransaccionForm.tsx` y
// `ListaTransacciones.tsx`). Texto de UI: español neutro, sin voseo.

import type { UsuarioDto } from '../../data/tauri-commands'
import { formatCentavos } from '../../domain/precision/money'

interface SelectorPerfilProps {
  perfiles: UsuarioDto[]
  onSeleccionar: (id: number) => void
  cargando: boolean
}

export function SelectorPerfil({
  perfiles,
  onSeleccionar,
  cargando,
}: SelectorPerfilProps): JSX.Element {
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
            <button
              type="button"
              data-testid="opcion-perfil"
              onClick={() => onSeleccionar(p.id)}
              className="w-full rounded-md border border-slate-300 bg-white p-4 text-left shadow-sm hover:border-slate-500 focus:outline-none"
            >
              <div className="text-base font-medium text-slate-900">{p.nombre}</div>
              <div className="mt-1 text-xs text-slate-500">
                Salario objetivo: {formatCentavos(p.salario_personal_objetivo_centavos)}
              </div>
            </button>
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