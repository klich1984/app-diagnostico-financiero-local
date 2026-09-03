// RightDrawer — organism que envuelve el panel lateral derecho del Dashboard V3.
//
// Design: openspec/changes/v3-dashboard-ui/design.md §Interfaces / Contratos
//         (RightDrawerProps) + §Estrategia Responsiva.
// Tasks:  2.5 — panel colapsable con data-testid="right-drawer", backdrop y
//         contenedor para TransaccionForm (children).
//
// Contrato de props:
//   isOpen   — controla visibilidad del panel (gestionado por App.tsx)
//   onClose  — callback que App.tsx conectará a `setDrawerOpen(false)`
//   titulo   — título que se muestra en la cabecera del panel
//   children — contenido inyectado (TransaccionForm + status panel)
//
// Responsabilidad de este componente:
//   ✔ Estructura interna del panel: cabecera con título + botón "Cerrar"
//   ✔ Colores V3 Dark Mode: bg-zinc-900, bordes border-white/10
//   ✔ aria-hidden y data-testid para tests y accesibilidad
//
// Responsabilidad del PADRE (DashboardLayout):
//   ✔ Posicionamiento: translate-x-full / translate-x-0, fixed vs. relative
//   ✔ Backdrop semitransparente en viewports < lg
//
// Este componente es 100% dumb: no tiene estado propio, no llama a servicios.

import type { ReactNode } from 'react'

export interface RightDrawerProps {
  isOpen: boolean
  onClose: () => void
  titulo: string
  children: ReactNode
}

export function RightDrawer({
  isOpen,
  onClose,
  titulo,
  children,
}: RightDrawerProps): JSX.Element {
  return (
    <section
      data-testid="right-drawer"
      aria-label={titulo}
      aria-hidden={!isOpen}
      className="flex h-full flex-col bg-zinc-900"
    >
      {/* Cabecera del panel */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-white/10 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-200">{titulo}</h2>

        <button
          type="button"
          data-testid="right-drawer-close"
          aria-label="Cerrar panel"
          onClick={onClose}
          className="rounded-md p-1 text-slate-400 transition-colors duration-150 hover:bg-white/10 hover:text-slate-200"
        >
          {/* × icon — sin SVG externo, Unicode suficiente para MVP */}
          <span aria-hidden="true" className="text-lg leading-none">
            ×
          </span>
        </button>
      </div>

      {/* Área de contenido: scroll interno para formularios largos */}
      <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
    </section>
  )
}
