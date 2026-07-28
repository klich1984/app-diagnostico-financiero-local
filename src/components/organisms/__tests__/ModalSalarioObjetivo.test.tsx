// Tests RED del ModalSalarioObjetivo (Slice A — D1).
//
// Este archivo existe ANTES de la implementación. El componente
// `ModalSalarioObjetivo` todavía no está creado, así que estos tests
// fallan al correr `pnpm test`. Cuando se implemente el organism
// (Tarea T-502), estos tests deben pasar.
//
// Contrato del componente (referencia: design.md §1.1):
//
//   interface ModalSalarioObjetivoProps {
//     salarioActualCentavos: number | null
//     onGuardar: (centavos: number) => Promise<void>
//     onCancelar: () => void
//     perfilActivoId: number | null  // null → modal no se renderiza
//   }
//
// Reglas del proyecto (no negociables):
//   * Sin `@testing-library/react`. Patrón: react-dom/client + createRoot + act.
//   * Texto de UI: español neutro LATAM, sin voseo.
//   * data-testid pineados en el componente para tests robustos:
//       - modal-salario-objetivo         (root)
//       - modal-salario-input            (input numérico)
//       - modal-salario-error            (slot de mensaje de error inline)
//       - modal-salario-error-valor      (mensaje "El valor no puede ser negativo")
//       - modal-salario-error-max        (mensaje "El valor excede el máximo permitido")
//       - modal-salario-error-vacio      (mensaje "Ingresa un valor")
//       - modal-salario-guardar          (botón Guardar)
//       - modal-salario-cancelar         (botón Cancelar)
//
// Escenarios cubiertos (referencia: spec.md §REQ-502-D1-*):
//   * REQ-502-D1-2: open with pre-loaded value
//   * REQ-502-D1-3: click Guardar invokes onGuardar with valid input
//   * REQ-502-D1-4: empty input → button disabled, inline message
//   * REQ-502-D1-5: negative input rejected
//   * REQ-502-D1-6: >$1B rejected
//   * REQ-502-D1-7: cancel/backdrop closes without persist
//   * REQ-502-D1-8: perfilActivoId change closes modal
//   * REQ-502-D1-9: onGuardar rejection shows error

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'

// El componente todavía no existe — este import fallará en RED.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error — RED phase: ModalSalarioObjetivo does not exist yet
import { ModalSalarioObjetivo } from '../ModalSalarioObjetivo'

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

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

// Render helper. Centraliza el `act()` wrap para que cada test se enfoque
// en las assertions, no en el plumbing de React.
function render(
  salarioActualCentavos: number | null,
  onGuardar: (centavos: number) => Promise<void>,
  onCancelar: () => void,
  perfilActivoId: number | null = 1,
): void {
  act(() => {
    root.render(
      <ModalSalarioObjetivo
        salarioActualCentavos={salarioActualCentavos}
        onGuardar={onGuardar}
        onCancelar={onCancelar}
        perfilActivoId={perfilActivoId}
      />,
    )
  })
}

// Helpers de interacción.
function getInput(): HTMLInputElement {
  const el = container.querySelector(
    '[data-testid="modal-salario-input"]',
  ) as HTMLInputElement | null
  if (!el) throw new Error('modal-salario-input not found')
  return el
}

function setInputValue(value: string): void {
  const input = getInput()
  act(() => {
    // React trackea el value via descriptor; asignar directamente dispara
    // un change event sintético para que el onChange handler corra.
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )?.set
    setter?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

async function clickGuardar(): Promise<void> {
  const btn = container.querySelector(
    '[data-testid="modal-salario-guardar"]',
  ) as HTMLButtonElement | null
  if (!btn) throw new Error('modal-salario-guardar not found')
  // `await act` espera a que las promises pendientes (incluido el await
  // interno de `handleGuardar` → `onGuardar`) terminen y React re-renderice.
  await act(async () => {
    btn.click()
    // Doble microtask flush para que la cadena setState → catch → setState
    // se complete antes de salir del act.
    await Promise.resolve()
    await Promise.resolve()
  })
}

async function clickCancelar(): Promise<void> {
  const btn = container.querySelector(
    '[data-testid="modal-salario-cancelar"]',
  ) as HTMLButtonElement | null
  if (!btn) throw new Error('modal-salario-cancelar not found')
  await act(async () => {
    btn.click()
    await Promise.resolve()
  })
}

function getErrorText(): string | null {
  const el = container.querySelector('[data-testid="modal-salario-error"]')
  return el?.textContent ?? null
}

// ---------------------------------------------------------------------------
// Escenarios
// ---------------------------------------------------------------------------

describe('ModalSalarioObjetivo — REQ-502-D1 modal salario objetivo', () => {
  it('REQ-502-D1-2 opens with pre-loaded value formatted as currency', () => {
    // 5.000.000 pesos = 500.000.000 centavos
    const onGuardar = vi.fn().mockResolvedValue(undefined)
    const onCancelar = vi.fn()
    render(500_000_000, onGuardar, onCancelar, 1)

    const input = getInput()
    // El componente pre-carga el valor formateado con formatCentavos.
    // formatCentavos(500_000_000) → "5.000.000" (es-ES, sin decimales porque centsPart === 0)
    expect(input.value).toBe('5.000.000')
  })

  it('REQ-502-D1-2 opens with empty input when salarioActualCentavos is null', () => {
    const onGuardar = vi.fn().mockResolvedValue(undefined)
    const onCancelar = vi.fn()
    render(null, onGuardar, onCancelar, 1)

    const input = getInput()
    expect(input.value).toBe('')
  })

  it('REQ-502-D1-3 click Guardar invokes onGuardar with parsed centavos', async () => {
    const onGuardar = vi.fn().mockResolvedValue(undefined)
    const onCancelar = vi.fn()
    render(0, onGuardar, onCancelar, 1)

    setInputValue('1.500.000')
    await clickGuardar()

    expect(onGuardar).toHaveBeenCalledTimes(1)
    expect(onGuardar).toHaveBeenCalledWith(150_000_000) // 1.500.000 pesos → 150M centavos
  })

  it('REQ-502-D1-4 empty input → button disabled and inline message', async () => {
    const onGuardar = vi.fn().mockResolvedValue(undefined)
    const onCancelar = vi.fn()
    render(500_000_000, onGuardar, onCancelar, 1)

    // El input arranca pre-cargado; lo vaciamos.
    setInputValue('')

    const btn = container.querySelector(
      '[data-testid="modal-salario-guardar"]',
    ) as HTMLButtonElement | null
    expect(btn).not.toBeNull()
    expect(btn?.disabled).toBe(true)

    expect(getErrorText()).toContain('Ingresa un valor')

    // onGuardar no debe ser invocado aunque hagamos click.
    await clickGuardar()
    expect(onGuardar).not.toHaveBeenCalled()
  })

  it('REQ-502-D1-5 negative input rejected with inline message', async () => {
    const onGuardar = vi.fn().mockResolvedValue(undefined)
    const onCancelar = vi.fn()
    render(0, onGuardar, onCancelar, 1)

    setInputValue('-500.000')
    await clickGuardar()

    // parsePesosInput retorna null para valores negativos.
    // El componente debe mostrar el mensaje y NO invocar onGuardar.
    expect(getErrorText()).toContain('El valor no puede ser negativo')
    expect(onGuardar).not.toHaveBeenCalled()
  })

  it('REQ-502-D1-6 value > $1B rejected with inline message', async () => {
    const onGuardar = vi.fn().mockResolvedValue(undefined)
    const onCancelar = vi.fn()
    render(0, onGuardar, onCancelar, 1)

    // 1.500.000.000 pesos > 1.000.000.000 (límite del modal)
    setInputValue('1.500.000.000')
    await clickGuardar()

    expect(getErrorText()).toContain('El valor excede el máximo permitido')
    expect(onGuardar).not.toHaveBeenCalled()
  })

  it('REQ-502-D1-7 click Cancelar invokes onCancelar without persist', async () => {
    const onGuardar = vi.fn().mockResolvedValue(undefined)
    const onCancelar = vi.fn()
    render(500_000_000, onGuardar, onCancelar, 1)

    setInputValue('999.999')
    await clickCancelar()

    expect(onCancelar).toHaveBeenCalledTimes(1)
    expect(onGuardar).not.toHaveBeenCalled()
  })

  it('REQ-502-D1-8 perfilActivoId change closes modal (parent unmount)', () => {
    const onGuardar = vi.fn().mockResolvedValue(undefined)
    const onCancelar = vi.fn()

    // Render inicial con perfilActivoId = 1
    render(500_000_000, onGuardar, onCancelar, 1)
    expect(
      container.querySelector('[data-testid="modal-salario-objetivo"]'),
    ).not.toBeNull()

    // Simulamos cambio de perfil: re-renderizamos con perfilActivoId = null.
    // El componente debe ocultarse (regla del contrato: null → modal no se renderiza).
    render(500_000_000, onGuardar, onCancelar, null)
    expect(
      container.querySelector('[data-testid="modal-salario-objetivo"]'),
    ).toBeNull()
  })

  it('REQ-502-D1-9 onGuardar rejection shows error inline and keeps modal open', async () => {
    const onGuardar = vi.fn().mockRejectedValue(new Error('IPC failure'))
    const onCancelar = vi.fn()
    render(500_000_000, onGuardar, onCancelar, 1)

    await clickGuardar()

    // El modal sigue abierto.
    expect(
      container.querySelector('[data-testid="modal-salario-objetivo"]'),
    ).not.toBeNull()
    // El error del IPC se muestra inline.
    expect(getErrorText()).toContain('IPC failure')
    // onCancelar NO fue invocado (el modal no se cerró por error).
    expect(onCancelar).not.toHaveBeenCalled()
  })

  it('REQ-502-D1-2 zero salarioActualCentavos pre-loads formatted as "0"', () => {
    const onGuardar = vi.fn().mockResolvedValue(undefined)
    const onCancelar = vi.fn()
    render(0, onGuardar, onCancelar, 1)

    const input = getInput()
    // formatCentavos(0) → "0"
    expect(input.value).toBe('0')
  })
})
