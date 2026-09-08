// Tests for DashboardLayout template (v3-dashboard-ui, Task 2.2).
//
// Spec:   openspec/changes/v3-dashboard-ui/specs/v3-dashboard-layout/spec.md
//         §REQ: Layout Flexbox de 3 columnas — Scenario "Visualización en
//         viewport 1080p sin scroll global" + "Adaptación con RightDrawer
//         colapsado".
// Design: openspec/changes/v3-dashboard-ui/design.md §Interfaces/Contratos
//         + §Estrategia Responsiva.
// Tasks:  2.2 — verificar renderizado de slots y visibilidad del drawer.
//
// Este template es 100% dumb: no tiene estado propio. Los tests sólo
// verifican que los 3 slots (sidebar, main, drawer) se renderizan con
// los data-testid correctos y que el drawer está visible / oculto
// según la prop `drawerOpen`.
//
// Patrón de renderizado: react-dom/client + createRoot + act() —
// idéntico al resto de tests del proyecto (sin @testing-library/react).

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { DashboardLayout } from '../DashboardLayout'

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

/**
 * Render helper — centraliza el act() para que cada test se enfoque
 * en la aserción.
 */
function renderLayout(drawerOpen: boolean): void {
  act(() => {
    root.render(
      <DashboardLayout
        sidebar={<div data-testid="slot-sidebar">Sidebar content</div>}
        main={<div data-testid="slot-main">Main content</div>}
        drawer={<div data-testid="slot-drawer">Drawer content</div>}
        drawerOpen={drawerOpen}
      />,
    )
  })
}

describe('DashboardLayout template', () => {
  // Verifica que el contenedor raíz tiene el data-testid correcto
  // y existe en el DOM.
  it('renders the root layout container with data-testid="dashboard-layout"', () => {
    renderLayout(false)

    const layout = container.querySelector('[data-testid="dashboard-layout"]')
    expect(layout).not.toBeNull()
  })

  // Verifica que el slot sidebar se renderiza en su columna lateral
  // y su contenido es accesible desde el DOM.
  it('renders the sidebar slot content inside dashboard-sidebar', () => {
    renderLayout(false)

    const sidebarCol = container.querySelector('[data-testid="dashboard-sidebar"]')
    expect(sidebarCol).not.toBeNull()

    const slotContent = container.querySelector('[data-testid="slot-sidebar"]')
    expect(slotContent).not.toBeNull()
    expect(slotContent?.textContent).toBe('Sidebar content')
  })

  // Verifica que el slot main se renderiza en la columna central.
  it('renders the main slot content inside dashboard-main', () => {
    renderLayout(false)

    const mainCol = container.querySelector('[data-testid="dashboard-main"]')
    expect(mainCol).not.toBeNull()

    const slotContent = container.querySelector('[data-testid="slot-main"]')
    expect(slotContent).not.toBeNull()
    expect(slotContent?.textContent).toBe('Main content')
  })

  // Verifica que el slot drawer se renderiza en la columna derecha
  // independientemente del estado drawerOpen.
  it('renders the drawer slot content inside dashboard-drawer', () => {
    renderLayout(true)

    const drawerCol = container.querySelector('[data-testid="dashboard-drawer"]')
    expect(drawerCol).not.toBeNull()

    const slotContent = container.querySelector('[data-testid="slot-drawer"]')
    expect(slotContent).not.toBeNull()
    expect(slotContent?.textContent).toBe('Drawer content')
  })

  // Spec: "Adaptación con RightDrawer colapsado" — cuando drawerOpen=true,
  // el drawer NO tiene la clase translate-x-full (está visible / deslizado).
  it('shows the drawer without translate-x-full when drawerOpen=true', () => {
    renderLayout(true)

    const drawerCol = container.querySelector<HTMLElement>('[data-testid="dashboard-drawer"]')
    expect(drawerCol).not.toBeNull()
    expect(drawerCol?.className).not.toContain('translate-x-full')
  })

  // Spec: "Adaptación con RightDrawer colapsado" — cuando drawerOpen=false,
  // el drawer tiene la clase translate-x-full (fuera de pantalla en mobile).
  it('hides the drawer with translate-x-full when drawerOpen=false', () => {
    renderLayout(false)

    const drawerCol = container.querySelector<HTMLElement>('[data-testid="dashboard-drawer"]')
    expect(drawerCol).not.toBeNull()
    expect(drawerCol?.className).toContain('translate-x-full')
  })

  // El backdrop sólo debe renderizarse cuando drawerOpen=true.
  it('renders the backdrop overlay when drawerOpen=true', () => {
    renderLayout(true)

    const backdrop = container.querySelector('[data-testid="dashboard-drawer-backdrop"]')
    expect(backdrop).not.toBeNull()
  })

  // El backdrop NO debe existir en el DOM cuando drawerOpen=false.
  it('does NOT render the backdrop overlay when drawerOpen=false', () => {
    renderLayout(false)

    const backdrop = container.querySelector('[data-testid="dashboard-drawer-backdrop"]')
    expect(backdrop).toBeNull()
  })

  // Los 3 slots deben coexistir en el mismo render: esta prueba garantiza
  // que el template no oculta ningún slot condicionalmente por error.
  it('renders all three slots simultaneously in the same layout', () => {
    renderLayout(false)

    const sidebar = container.querySelector('[data-testid="slot-sidebar"]')
    const main = container.querySelector('[data-testid="slot-main"]')
    const drawer = container.querySelector('[data-testid="slot-drawer"]')

    expect(sidebar).not.toBeNull()
    expect(main).not.toBeNull()
    expect(drawer).not.toBeNull()
  })
})
