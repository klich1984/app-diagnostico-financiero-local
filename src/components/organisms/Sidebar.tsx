// Sidebar — organism de navegación vertical para el Dashboard V3.
//
// Spec:   openspec/changes/v3-dashboard-ui/specs/v3-dashboard-layout/spec.md
//         §REQ: Navegación y Perfil en Sidebar — Scenarios "Cambio de tab",
//         "Preservación de perfil activo", "Preservación de SelectorPerfil".
// Design: openspec/changes/v3-dashboard-ui/design.md §Interfaces / Contratos
//         + §Cambios en Archivos (organisms/Sidebar.tsx).
// Tasks:  2.3 — Sidebar con data-testid, ARIA roles y paleta V3 Dark Mode.
//         Tech debt (v3-theme-toggle) — toggle Light/Dark Mode.
//
// Contrato de props:
//   tabActiva           — tab actualmente seleccionada (unión TabActiva)
//   onTabChange         — callback para cambio de tab (emit al padre)
//   perfilActivoNombre  — nombre del perfil activo (null = sin perfil)
//   modoMejorado        — true = presupuesto mejorado activo
//   onToggleModoMejorado — callback para alternar modo mejorado
//   modoOscuro          — true = dark mode activo (default)
//   onToggleTema        — callback para alternar light/dark
//   onExportarExcel     — callback para exportar a Excel
//   selectorPerfilSlot  — ReactNode inyectado por App.tsx con el overlay
//                         SelectorPerfil (se renderiza cuando el usuario
//                         hace click en el chip de perfil)
//
// Este componente es 100% dumb: no tiene estado propio, no llama a servicios.
// Toda la lógica y el estado viven en App.tsx (decisión de diseño, design.md
// §Decisiones de Arquitectura — Props drilling explícito).

import type { ReactNode } from 'react'
import type { TabActiva } from '../../types/tabs'

export interface SidebarProps {
  tabActiva: TabActiva
  onTabChange: (tab: TabActiva) => void
  perfilActivoNombre: string | null
  modoMejorado: boolean
  onToggleModoMejorado: () => void
  modoOscuro: boolean
  onToggleTema: () => void
  onExportarExcel: () => void
  selectorPerfilSlot: ReactNode
}

// Definición de las tabs de navegación — en orden de aparición vertical.
// Cada entrada mapea directamente al valor de TabActiva.
const TABS: { id: TabActiva; label: string; testId: string }[] = [
  { id: 'transacciones', label: 'Transacciones', testId: 'tab-transacciones' },
  { id: 'presupuesto', label: 'Presupuesto', testId: 'tab-presupuesto' },
  { id: 'simulador', label: 'Simulador', testId: 'tab-simulador' },
  {
    id: 'presupuesto-mejorado',
    label: 'Ppto. Mejorado',
    testId: 'tab-presupuesto-mejorado',
  },
  { id: 'resultados', label: 'Resultados', testId: 'tab-resultados' },
]

export function Sidebar({
  tabActiva,
  onTabChange,
  perfilActivoNombre,
  modoMejorado,
  onToggleModoMejorado,
  modoOscuro,
  onToggleTema,
  onExportarExcel,
  selectorPerfilSlot,
}: SidebarProps): JSX.Element {
  return (
    <nav
      data-testid="sidebar"
      role="navigation"
      aria-label="Navegación principal"
      className="flex h-full flex-col bg-white dark:bg-zinc-900 px-2 py-4"
    >
      {/* Logo / Título de la app */}
      <div className="mb-6 px-3">
        <span className="text-sm font-semibold tracking-widest text-slate-500 dark:text-slate-400 uppercase">
          Finanzas V3
        </span>
      </div>

      {/* Lista de tabs de navegación */}
      <ul role="tablist" aria-label="Secciones" className="flex flex-col gap-1">
        {TABS.map(({ id, label, testId }) => {
          const isActive = tabActiva === id
          return (
            <li key={id} role="presentation">
              <button
                type="button"
                role="tab"
                data-testid={testId}
                aria-selected={isActive}
                onClick={() => onTabChange(id)}
                className={[
                  'w-full rounded-md px-3 py-2 text-left text-sm font-medium transition-colors duration-150',
                  isActive
                    ? 'bg-salmon/10 text-salmon font-semibold'
                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-800 dark:hover:text-slate-200',
                ].join(' ')}
              >
                {label}
              </button>
            </li>
          )
        })}
      </ul>

      {/* Spacer: empuja los controles inferiores al fondo */}
      <div className="flex-1" />

      {/* Toggle Light/Dark Mode */}
      <div className="px-1 pb-2">
        <button
          type="button"
          data-testid="boton-toggle-tema"
          aria-pressed={modoOscuro}
          onClick={onToggleTema}
          className="w-full rounded-md px-3 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400 transition-colors duration-150 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-800 dark:hover:text-slate-300"
        >
          {modoOscuro ? '☀ Modo claro' : '☾ Modo oscuro'}
        </button>
      </div>

      {/* Toggle modo mejorado */}
      <div className="px-1 pb-2">
        <button
          type="button"
          data-testid="boton-toggle-modo-mejorado"
          aria-pressed={modoMejorado}
          onClick={onToggleModoMejorado}
          className={[
            'w-full rounded-md px-3 py-2 text-left text-xs font-medium transition-colors duration-150',
            modoMejorado
              ? 'bg-salmon/10 text-salmon'
              : 'text-slate-500 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-800 dark:hover:text-slate-300',
          ].join(' ')}
        >
          {modoMejorado ? '✦ Modo Mejorado' : 'Modo Mejorado'}
        </button>
      </div>

      {/* Botón exportar Excel */}
      <div className="px-1 pb-2">
        <button
          type="button"
          data-testid="boton-exportar-excel"
          onClick={onExportarExcel}
          className="w-full rounded-md px-3 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-500 transition-colors duration-150 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-800 dark:hover:text-slate-300"
        >
          Exportar Excel
        </button>
      </div>

      {/* Chip de perfil activo + slot para SelectorPerfil overlay */}
      <div className="border-t border-slate-200 dark:border-white/10 px-1 pt-3">
        <div
          data-testid="perfil-activo-chip"
          className="flex items-center gap-2 rounded-md px-3 py-2 text-xs text-slate-500 dark:text-slate-400"
        >
          <span className="inline-block h-2 w-2 rounded-full bg-salmon flex-shrink-0" />
          <span className="truncate">
            {perfilActivoNombre ?? 'Sin perfil'}
          </span>
        </div>
        {/* Slot inyectado por App.tsx — contiene el SelectorPerfil modal */}
        {selectorPerfilSlot}
      </div>
    </nav>
  )
}
