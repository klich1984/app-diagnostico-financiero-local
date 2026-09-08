// Tests for RightDrawer organism (v3-dashboard-ui, Task 2.6).
//
// Design: openspec/changes/v3-dashboard-ui/design.md §Interfaces / Contratos
//         (RightDrawerProps) + §Estrategia de Pruebas (toggling y botón cerrar).
// Tasks:  2.6 — verificar toggling (aria-hidden), children renderizados y
//         callback onClose al hacer click en el botón "Cerrar".
//
// Patrón de renderizado: react-dom/client + createRoot + act() —
// idéntico al resto de tests del proyecto (sin @testing-library/react).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { RightDrawer } from '../RightDrawer'

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
  isOpen?: boolean
  onClose?: () => void
  titulo?: string
  children?: React.ReactNode
}

function renderDrawer(opts: RenderOptions = {}): void {
  const {
    isOpen = true,
    onClose = vi.fn(),
    titulo = 'Nueva Transacción',
    children = null,
  } = opts

  act(() => {
    root.render(
      <RightDrawer isOpen={isOpen} onClose={onClose} titulo={titulo}>
        {children}
      </RightDrawer>,
    )
  })
}

describe('RightDrawer organism', () => {
  // -----------------------------------------------------------------------
  // Estructura raíz y data-testid
  // -----------------------------------------------------------------------

  it('renders the root section with data-testid="right-drawer"', () => {
    renderDrawer()
    const section = container.querySelector('[data-testid="right-drawer"]')
    expect(section).not.toBeNull()
  })

  it('renders the close button with data-testid="right-drawer-close"', () => {
    renderDrawer()
    const btn = container.querySelector('[data-testid="right-drawer-close"]')
    expect(btn).not.toBeNull()
  })

  // -----------------------------------------------------------------------
  // Visibilidad / toggling via aria-hidden
  // -----------------------------------------------------------------------

  // Design §Estrategia de Pruebas: "RightDrawer toggle open/close —
  // verificar visibilidad condicional".
  it('sets aria-hidden="false" when isOpen=true', () => {
    renderDrawer({ isOpen: true })
    const section = container.querySelector('[data-testid="right-drawer"]')
    expect(section?.getAttribute('aria-hidden')).toBe('false')
  })

  it('sets aria-hidden="true" when isOpen=false', () => {
    renderDrawer({ isOpen: false })
    const section = container.querySelector('[data-testid="right-drawer"]')
    expect(section?.getAttribute('aria-hidden')).toBe('true')
  })

  // -----------------------------------------------------------------------
  // Título en la cabecera
  // -----------------------------------------------------------------------

  it('displays the titulo prop in the header', () => {
    renderDrawer({ titulo: 'Editar Transacción' })
    const header = container.querySelector('h2')
    expect(header?.textContent).toBe('Editar Transacción')
  })

  // -----------------------------------------------------------------------
  // Callback onClose — Spec §"botón cerrar"
  // -----------------------------------------------------------------------

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn()
    renderDrawer({ onClose })

    const btn = container.querySelector<HTMLButtonElement>(
      '[data-testid="right-drawer-close"]',
    )
    act(() => {
      btn?.click()
    })

    expect(onClose).toHaveBeenCalledOnce()
  })

  it('does not call onClose before the button is clicked', () => {
    const onClose = vi.fn()
    renderDrawer({ onClose })
    expect(onClose).not.toHaveBeenCalled()
  })

  // -----------------------------------------------------------------------
  // Children — el drawer debe renderizar su contenido inyectado
  // -----------------------------------------------------------------------

  it('renders injected children content', () => {
    const childContent = (
      <div data-testid="transaccion-form-mock">Formulario de transacción</div>
    )
    renderDrawer({ children: childContent })

    const form = container.querySelector('[data-testid="transaccion-form-mock"]')
    expect(form).not.toBeNull()
    expect(form?.textContent).toBe('Formulario de transacción')
  })

  it('renders multiple children without error', () => {
    const multiChildren = (
      <>
        <div data-testid="child-1">Hijo 1</div>
        <div data-testid="child-2">Hijo 2</div>
      </>
    )
    renderDrawer({ children: multiChildren })

    expect(container.querySelector('[data-testid="child-1"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="child-2"]')).not.toBeNull()
  })

  it('renders without children (null) without crashing', () => {
    renderDrawer({ children: null })
    // El drawer debe seguir renderizándose con la cabecera intacta
    const section = container.querySelector('[data-testid="right-drawer"]')
    expect(section).not.toBeNull()
  })

  // -----------------------------------------------------------------------
  // Aria-label refleja el título
  // -----------------------------------------------------------------------

  it('sets aria-label on the section equal to the titulo prop', () => {
    renderDrawer({ titulo: 'Panel de operaciones' })
    const section = container.querySelector('[data-testid="right-drawer"]')
    expect(section?.getAttribute('aria-label')).toBe('Panel de operaciones')
  })
})
