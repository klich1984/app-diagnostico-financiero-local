// DashboardLayout — template de Atomic Design que orquesta el layout
// flexbox de 3 columnas para la interfaz principal V3.
//
// Contrato de diseño (design.md §Interfaces / Contratos):
//   sidebar    — ReactNode → columna izquierda (w-64, fijo)
//   main       — ReactNode → columna central (flex-1, scroll interno)
//   drawer     — ReactNode → columna derecha (w-80, condicional)
//   drawerOpen — boolean  → controla visibilidad del drawer
//
// Responsividad (design.md §Estrategia Responsiva):
//   >= lg (1024px+) : drawer inline w-80 relative
//   <  lg           : drawer overlay fixed inset-y-0 right-0 z-40
//                     con backdrop semitransparente
//
// Este componente es 100% dumb: no tiene estado propio, no llama a
// servicios, no conoce el dominio. Toda la lógica vive en App.tsx.

import type { ReactNode } from 'react'

export interface DashboardLayoutProps {
  sidebar: ReactNode
  main: ReactNode
  drawer: ReactNode
  drawerOpen: boolean
}

export function DashboardLayout({
  sidebar,
  main,
  drawer,
  drawerOpen,
}: DashboardLayoutProps): JSX.Element {
  return (
    <div
      data-testid="dashboard-layout"
      className="flex h-screen overflow-hidden bg-slate-100 dark:bg-zinc-950"
    >
      {/* Columna izquierda: Sidebar fijo */}
      <aside
        data-testid="dashboard-sidebar"
        className="w-64 flex-shrink-0 flex flex-col overflow-y-auto border-r border-slate-200 dark:border-white/10"
      >
        {sidebar}
      </aside>

      {/* Columna central: MainStage flexible */}
      <main
        data-testid="dashboard-main"
        className="flex-1 overflow-y-auto"
      >
        {main}
      </main>

      {/* Backdrop para drawer en viewports < lg */}
      {drawerOpen && (
        <div
          data-testid="dashboard-drawer-backdrop"
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          aria-hidden="true"
        />
      )}

      {/* Columna derecha: RightDrawer inline (lg+) u overlay (< lg) */}
      <aside
        data-testid="dashboard-drawer"
        className={[
          // Base: transición suave
          'w-80 flex-shrink-0 flex flex-col overflow-y-auto border-l border-slate-200 dark:border-white/10',
          'transition-transform duration-200',
          // Desktop lg+: posición relativa, siempre visible si drawerOpen
          'lg:relative lg:translate-x-0',
          // Mobile: posición fixed, desliza desde la derecha
          drawerOpen
            ? 'fixed inset-y-0 right-0 z-40 translate-x-0 lg:static'
            : 'fixed inset-y-0 right-0 z-40 translate-x-full lg:translate-x-0 lg:hidden',
        ].join(' ')}
      >
        {drawer}
      </aside>
    </div>
  )
}
