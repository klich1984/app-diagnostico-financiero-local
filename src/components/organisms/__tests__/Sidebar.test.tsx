// Tests for Sidebar organism (v3-dashboard-ui, Task 2.4).
//
// Spec:   openspec/changes/v3-dashboard-ui/specs/v3-dashboard-layout/spec.md
//         §REQ: Navegación y Perfil en Sidebar
//         Scenario: "Cambio de tab desde el Sidebar"
//         Scenario: "Preservación de perfil activo en Sidebar"
//         Scenario: "Preservación de SelectorPerfil como modal overlay global"
// Design: openspec/changes/v3-dashboard-ui/design.md §Interfaces / Contratos
//         (SidebarProps) + §Nota crítica (data-testid preservados).
// Tasks:  2.4 — verificar navegación de tabs, tab activa marcada, callbacks
//         y renderizado del selectorPerfilSlot inyectado.
//
// Patrón de renderizado: react-dom/client + createRoot + act() —
// idéntico al resto de tests del proyecto (sin @testing-library/react).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { Sidebar } from '../Sidebar'
import type { TabActiva } from '../../../types/tabs'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => {
    root.unmount()
  })
  container.remove()
})

// ---------------------------------------------------------------------------
// Render helper — centraliza el act() y valores por defecto para que cada
// test sólo sobreescriba lo que le importa.
// ---------------------------------------------------------------------------
interface RenderOptions {
  tabActiva?: TabActiva
  onTabChange?: (tab: TabActiva) => void
  perfilActivoNombre?: string | null
  modoMejorado?: boolean
  onToggleModoMejorado?: () => void
  onExportarExcel?: () => void
  selectorPerfilSlot?: React.ReactNode
}

function renderSidebar(opts: RenderOptions = {}): void {
  const {
    tabActiva = 'transacciones',
    onTabChange = vi.fn(),
    perfilActivoNombre = 'Usuario Test',
    modoMejorado = false,
    onToggleModoMejorado = vi.fn(),
    onExportarExcel = vi.fn(),
    selectorPerfilSlot = null,
  } = opts

  act(() => {
    root.render(
      <Sidebar
        tabActiva={tabActiva}
        onTabChange={onTabChange}
        perfilActivoNombre={perfilActivoNombre}
        modoMejorado={modoMejorado}
        onToggleModoMejorado={onToggleModoMejorado}
        onExportarExcel={onExportarExcel}
        selectorPerfilSlot={selectorPerfilSlot}
      />,
    )
  })
}

describe('Sidebar organism', () => {
  // -----------------------------------------------------------------------
  // Estructura raíz y ARIA
  // -----------------------------------------------------------------------

  it('renders the root nav element with data-testid="sidebar"', () => {
    renderSidebar()
    const nav = container.querySelector('[data-testid="sidebar"]')
    expect(nav).not.toBeNull()
  })

  it('has role="navigation" on the root element', () => {
    renderSidebar()
    const nav = container.querySelector('[data-testid="sidebar"]')
    expect(nav?.getAttribute('role')).toBe('navigation')
  })

  // -----------------------------------------------------------------------
  // Presencia de todos los data-testid de tabs (Task 2.3 contract)
  // -----------------------------------------------------------------------

  it('renders tab-transacciones button with correct data-testid', () => {
    renderSidebar()
    expect(container.querySelector('[data-testid="tab-transacciones"]')).not.toBeNull()
  })

  it('renders tab-presupuesto button with correct data-testid', () => {
    renderSidebar()
    expect(container.querySelector('[data-testid="tab-presupuesto"]')).not.toBeNull()
  })

  it('renders tab-simulador button with correct data-testid', () => {
    renderSidebar()
    expect(container.querySelector('[data-testid="tab-simulador"]')).not.toBeNull()
  })

  it('renders tab-presupuesto-mejorado button with correct data-testid', () => {
    renderSidebar()
    expect(container.querySelector('[data-testid="tab-presupuesto-mejorado"]')).not.toBeNull()
  })

  it('renders tab-resultados button with correct data-testid', () => {
    renderSidebar()
    expect(container.querySelector('[data-testid="tab-resultados"]')).not.toBeNull()
  })

  // -----------------------------------------------------------------------
  // Tab activa: aria-selected y estado visual
  // -----------------------------------------------------------------------

  // Spec §"Cambio de tab desde el Sidebar": la tab activa debe estar
  // marcada con aria-selected="true".
  it('marks the active tab with aria-selected="true"', () => {
    renderSidebar({ tabActiva: 'presupuesto' })

    const activeBtn = container.querySelector<HTMLElement>(
      '[data-testid="tab-presupuesto"]',
    )
    expect(activeBtn?.getAttribute('aria-selected')).toBe('true')
  })

  it('marks inactive tabs with aria-selected="false"', () => {
    renderSidebar({ tabActiva: 'presupuesto' })

    const inactiveBtn = container.querySelector<HTMLElement>(
      '[data-testid="tab-transacciones"]',
    )
    expect(inactiveBtn?.getAttribute('aria-selected')).toBe('false')
  })

  // -----------------------------------------------------------------------
  // Callback onTabChange
  // -----------------------------------------------------------------------

  // Spec §"Cambio de tab desde el Sidebar": hacer click debe llamar a
  // onTabChange con el id correcto.
  it('calls onTabChange with "simulador" when tab-simulador is clicked', () => {
    const onTabChange = vi.fn()
    renderSidebar({ onTabChange })

    const btn = container.querySelector<HTMLButtonElement>('[data-testid="tab-simulador"]')
    act(() => {
      btn?.click()
    })

    expect(onTabChange).toHaveBeenCalledOnce()
    expect(onTabChange).toHaveBeenCalledWith('simulador')
  })

  it('calls onTabChange with "resultados" when tab-resultados is clicked', () => {
    const onTabChange = vi.fn()
    renderSidebar({ onTabChange })

    const btn = container.querySelector<HTMLButtonElement>('[data-testid="tab-resultados"]')
    act(() => {
      btn?.click()
    })

    expect(onTabChange).toHaveBeenCalledWith('resultados')
  })

  // -----------------------------------------------------------------------
  // Chip de perfil activo (data-testid="perfil-activo-chip")
  // -----------------------------------------------------------------------

  // Spec §"Preservación de perfil activo en Sidebar": se muestra el chip.
  it('renders perfil-activo-chip with correct data-testid', () => {
    renderSidebar()
    const chip = container.querySelector('[data-testid="perfil-activo-chip"]')
    expect(chip).not.toBeNull()
  })

  it('displays the perfilActivoNombre inside perfil-activo-chip', () => {
    renderSidebar({ perfilActivoNombre: 'Juan Pérez' })
    const chip = container.querySelector('[data-testid="perfil-activo-chip"]')
    expect(chip?.textContent).toContain('Juan Pérez')
  })

  it('shows "Sin perfil" when perfilActivoNombre is null', () => {
    renderSidebar({ perfilActivoNombre: null })
    const chip = container.querySelector('[data-testid="perfil-activo-chip"]')
    expect(chip?.textContent).toContain('Sin perfil')
  })

  // -----------------------------------------------------------------------
  // Toggle modo mejorado (data-testid="boton-toggle-modo-mejorado")
  // -----------------------------------------------------------------------

  it('renders boton-toggle-modo-mejorado with correct data-testid', () => {
    renderSidebar()
    expect(container.querySelector('[data-testid="boton-toggle-modo-mejorado"]')).not.toBeNull()
  })

  it('reflects modoMejorado=true with aria-pressed="true"', () => {
    renderSidebar({ modoMejorado: true })
    const btn = container.querySelector<HTMLElement>('[data-testid="boton-toggle-modo-mejorado"]')
    expect(btn?.getAttribute('aria-pressed')).toBe('true')
  })

  it('reflects modoMejorado=false with aria-pressed="false"', () => {
    renderSidebar({ modoMejorado: false })
    const btn = container.querySelector<HTMLElement>('[data-testid="boton-toggle-modo-mejorado"]')
    expect(btn?.getAttribute('aria-pressed')).toBe('false')
  })

  it('calls onToggleModoMejorado when the toggle button is clicked', () => {
    const onToggleModoMejorado = vi.fn()
    renderSidebar({ onToggleModoMejorado })

    const btn = container.querySelector<HTMLButtonElement>(
      '[data-testid="boton-toggle-modo-mejorado"]',
    )
    act(() => {
      btn?.click()
    })

    expect(onToggleModoMejorado).toHaveBeenCalledOnce()
  })

  // -----------------------------------------------------------------------
  // selectorPerfilSlot — slot inyectado por App.tsx
  // -----------------------------------------------------------------------

  // Spec §"Preservación de SelectorPerfil como modal overlay global":
  // el slot inyectado debe aparecer en el DOM del Sidebar.
  it('renders the injected selectorPerfilSlot content', () => {
    const slot = <div data-testid="selector-perfil-slot-content">SelectorPerfil mock</div>
    renderSidebar({ selectorPerfilSlot: slot })

    const slotContent = container.querySelector('[data-testid="selector-perfil-slot-content"]')
    expect(slotContent).not.toBeNull()
    expect(slotContent?.textContent).toBe('SelectorPerfil mock')
  })

  it('renders nothing for selectorPerfilSlot when null is passed', () => {
    renderSidebar({ selectorPerfilSlot: null })
    // Verificamos que el chip de perfil sigue ahí — el slot null no rompe el render
    const chip = container.querySelector('[data-testid="perfil-activo-chip"]')
    expect(chip).not.toBeNull()
  })

  // -----------------------------------------------------------------------
  // Roles ARIA en la lista de tabs
  // -----------------------------------------------------------------------

  it('wraps tabs in a ul with role="tablist"', () => {
    renderSidebar()
    const tablist = container.querySelector('[role="tablist"]')
    expect(tablist).not.toBeNull()
  })

  it('each tab button has role="tab"', () => {
    renderSidebar()
    const tabButtons = container.querySelectorAll('[role="tab"]')
    // 5 tabs: transacciones, presupuesto, simulador, presupuesto-mejorado, resultados
    expect(tabButtons.length).toBe(5)
  })
})
