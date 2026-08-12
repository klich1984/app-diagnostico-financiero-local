// Tests for Slice 9 (perfil multi-usuario): SelectorPerfil organism.
//
// Spec:    `openspec/changes/mvp-financiero-local-first/spec.md` §REQ-501
//          (Scenario "Selector de perfil al iniciar" — se muestra un
//          selector obligatorio) + §REQ-603 (soporte multi-perfil).
// Design:  `openspec/changes/mvp-financiero-local-first/design.md` §7
//          (Atomic Design: SelectorPerfil es un organism que compone
//          atoms/botones + itera sobre la lista de `UsuarioDto`).
// Tasks:   T-501 (selector UI) + T-601 (cambio de perfil).
// Test #:  slice 9 / frontend / REQ-501 selector organism (5 tests).
//
// RED PHASE: this file imports `SelectorPerfil` from `../SelectorPerfil`,
// a module that does NOT exist yet. `pnpm test` MUST fail at the
// import-resolution step. That is the expected RED state.
//
// The IMPL phase will introduce `src/components/organisms/SelectorPerfil.tsx`
// with the signature:
//
//   interface SelectorPerfilProps {
//     perfiles: UsuarioDto[]
//     onSeleccionar: (id: number) => void
//     cargando: boolean
//   }
//
//   export function SelectorPerfil(props: SelectorPerfilProps): JSX.Element
//
// The IMPL MUST expose the following `data-testid` attributes so the
// tests can find rows/buttons deterministically (Spanish text + multiple
// rows + i18n-able labels would make getByText/getByRole flaky across
// refactors):
//
//   * `data-testid="selector-perfil"`          — root container (the
//                                                full-screen overlay)
//   * `data-testid="selector-perfil-cargando"`  — loading-state
//                                                placeholder (shown when
//                                                `cargando=true` and
//                                                `perfiles=[]`)
//   * `data-testid="opcion-perfil"`            — each row in the
//                                                profile list (one per
//                                                element of `perfiles`)
//   * `data-testid="boton-crear-perfil"`       — the "create new
//                                                profile" button (always
//                                                rendered at the bottom)
//
// ## Render pattern
//
// We render with `react-dom/client` + `createRoot` + `act()` directly
// (no `@testing-library/react`; project's hard rule forbids new deps).
// See `__tests__/ListaTransacciones.test.tsx` for the canonical setup
// file. The setup file at `src/__tests__/setup.ts` already enables
// `globalThis.IS_REACT_ACT_ENVIRONMENT = true`.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { SelectorPerfil } from '../SelectorPerfil'
import type { UsuarioDto } from '../../../data/tauri-commands'

// Sample fixture used across the tests. Two profiles, one of which is
// the seeded 'Yo' default (id=1, salario=$500k, modo_mejorado=false)
// and a second one for 'Maria' (id=2, salario=$600k, modo_mejorado=false).
const samplePerfiles: UsuarioDto[] = [
  {
    id: 1,
    nombre: 'Yo',
    salario_personal_objetivo_centavos: 50_000_000,
    modo_mejorado_activo: false,
  },
  {
    id: 2,
    nombre: 'Maria',
    salario_personal_objetivo_centavos: 60_000_000,
    modo_mejorado_activo: false,
  },
]

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

/// Render helper. Defaults to no-op handlers so most tests just assert
/// on the DOM shape; the click test passes its own mock.
function render(
  perfiles: UsuarioDto[],
  onSeleccionar: (id: number) => void = () => {},
  cargando = false,
) {
  act(() => {
    root.render(
      <SelectorPerfil
        perfiles={perfiles}
        onSeleccionar={onSeleccionar}
        cargando={cargando}
      />,
    )
  })
}

describe('REQ-501 / Slice 9: SelectorPerfil organism', () => {
  // REQ-501 / Scenario "Selector de perfil al iniciar": when the app
  // boots with no profile active, the selector MUST cover the screen
  // (the user MUST pick or create a profile before seeing the rest of
  // the UI). The "overlay" is rendered as a root container with the
  // canonical `data-testid="selector-perfil"`.
  //
  // Given: two profiles available, NOT loading, no profile clicked.
  // When:  the organism is rendered.
  // Then:  the root overlay container is present in the DOM.
  it('renders a full-screen overlay when shown', () => {
    render(samplePerfiles)

    const overlay = container.querySelector('[data-testid="selector-perfil"]')
    expect(overlay).not.toBeNull()
  })

  // REQ-501 / Scenario "Selector de perfil al iniciar": the selector
  // MUST surface ONE option per profile available, so the user can
  // pick any of them. The DOM contract is one
  // `[data-testid="opcion-perfil"]` node per element of `perfiles`.
  //
  // Given: two profiles (Yo + Maria).
  // When:  the organism is rendered.
  // Then:  there are exactly 2 option nodes.
  it('renders one option per profile', () => {
    render(samplePerfiles)

    const options = container.querySelectorAll('[data-testid="opcion-perfil"]')
    expect(options.length).toBe(2)
  })

  // REQ-501 / UI: clicking an option MUST call `onSeleccionar` with
  // that profile's `id` (and only that id). The App-level wiring
  // (localStorage persistence + IPC refetch) is layered on top of this
  // organism's contract — Slice 9 keeps this organism dumb so the
  // wiring can be tested at the App layer later if needed.
  //
  // Given: two profiles + a `vi.fn()` onSeleccionar.
  // When:  the user clicks the SECOND option (Maria, id=2).
  // Then:  `onSeleccionar` is called exactly once with `2`.
  it('calls onSeleccionar with the right id when an option is clicked', async () => {
    const onSeleccionar = vi.fn()
    await act(async () => {
      root.render(
        <SelectorPerfil
          perfiles={samplePerfiles}
          onSeleccionar={onSeleccionar}
          cargando={false}
        />,
      )
    })

    const options = container.querySelectorAll('[data-testid="opcion-perfil"]')
    expect(options.length).toBe(2)

    // Click the second option (Maria's id is 2; see fixture).
    await act(async () => {
      (options[1] as HTMLButtonElement).click()
    })

    expect(onSeleccionar).toHaveBeenCalledTimes(1)
    expect(onSeleccionar).toHaveBeenCalledWith(2)
  })

  // REQ-501 / UX: while the profile list is being fetched (the initial
  // IPC call to `cmd_obtener_perfiles` is in flight), the selector
  // MUST show a loading message — NOT a blank screen. The
  // `data-testid="selector-perfil-cargando"` node is the contract.
  //
  // Given: no profiles yet + `cargando = true`.
  // When:  the organism is rendered.
  // Then:  the loading-state placeholder is present.
  it('shows loading state when cargando=true', () => {
    render([], () => {}, true)

    const loading = container.querySelector('[data-testid="selector-perfil-cargando"]')
    expect(loading).not.toBeNull()
  })

  // REQ-501 / Scenario "Selector de perfil al iniciar": the user MUST be
  // able to CREATE a new profile from the selector itself
  // (Scenario line: "el usuario debe seleccionar o crear un perfil").
  // The button is always visible at the bottom of the selector.
  //
  // Given: any state (two profiles in this test).
  // When:  the organism is rendered.
  // Then:  the create-new button is present in the DOM.
  //
  // NOTE: this test asserts ONLY the DOM presence. The IMPL is free to
  // expose the create flow via an `onCrear` callback OR an internal
  // modal — either is fine for the MVP; the App-level wiring will own
  // the actual `crearPerfil` IPC call.
  it('shows create-new button', () => {
    render(samplePerfiles)

    const createBtn = container.querySelector('[data-testid="boton-crear-perfil"]')
    expect(createBtn).not.toBeNull()
  })
})

// ===========================================================================
// REQ-V2-102 / Phase 2.3: Profile Management UI (rename + delete)
// ===========================================================================
//
// These tests extend the SelectorPerfil organism with management actions.
// The component receives two NEW optional callbacks:
//
//   onRenombrar?: (id: number, nuevoNombre: string) => void
//   onEliminar?:  (id: number) => void
//
// When provided, each profile row renders:
//   * `data-testid="boton-renombrar-perfil"` — triggers inline rename
//   * `data-testid="boton-eliminar-perfil"` — calls onEliminar(id)
//
// The inline rename flow:
//   1. Click "Renombrar" → row transforms into an input + "Guardar" button
//   2. `data-testid="input-renombrar-perfil"` — the text input (pre-filled)
//   3. `data-testid="boton-guardar-renombrar"` — confirms the rename
//   4. Click "Guardar" → calls onRenombrar(id, newName)
//
// RED PHASE: the component does NOT implement these yet. All tests below
// MUST FAIL until the GREEN phase lands.

/// Helper: type a value into a controlled text input using the native
/// setter trick (mirrors the pattern from TransaccionForm.test.tsx).
function typeInto(input: HTMLInputElement, raw: string): void {
  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  )?.set
  nativeSetter?.call(input, raw)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('REQ-V2-102: SelectorPerfil profile management', () => {
  it('renders rename and delete buttons for each profile when callbacks are provided', () => {
    act(() => {
      root.render(
        <SelectorPerfil
          perfiles={samplePerfiles}
          onSeleccionar={() => {}}
          cargando={false}
          onRenombrar={() => {}}
          onEliminar={() => {}}
        />,
      )
    })

    const renameButtons = container.querySelectorAll('[data-testid="boton-renombrar-perfil"]')
    const deleteButtons = container.querySelectorAll('[data-testid="boton-eliminar-perfil"]')

    expect(renameButtons.length).toBe(2)
    expect(deleteButtons.length).toBe(2)
  })

  it('does NOT render rename/delete buttons when callbacks are absent', () => {
    act(() => {
      root.render(
        <SelectorPerfil
          perfiles={samplePerfiles}
          onSeleccionar={() => {}}
          cargando={false}
        />,
      )
    })

    const renameButtons = container.querySelectorAll('[data-testid="boton-renombrar-perfil"]')
    const deleteButtons = container.querySelectorAll('[data-testid="boton-eliminar-perfil"]')

    expect(renameButtons.length).toBe(0)
    expect(deleteButtons.length).toBe(0)
  })

  it('calls onEliminar with the correct profile id when delete is clicked', async () => {
    const onEliminar = vi.fn()

    await act(async () => {
      root.render(
        <SelectorPerfil
          perfiles={samplePerfiles}
          onSeleccionar={() => {}}
          cargando={false}
          onRenombrar={() => {}}
          onEliminar={onEliminar}
        />,
      )
    })

    const deleteButtons = container.querySelectorAll('[data-testid="boton-eliminar-perfil"]')
    expect(deleteButtons.length).toBe(2)

    // Click delete on the second profile (Maria, id=2)
    await act(async () => {
      ;(deleteButtons[1] as HTMLButtonElement).click()
    })

    expect(onEliminar).toHaveBeenCalledTimes(1)
    expect(onEliminar).toHaveBeenCalledWith(2)
  })

  it('enters inline rename mode and calls onRenombrar with new name', async () => {
    const onRenombrar = vi.fn()

    await act(async () => {
      root.render(
        <SelectorPerfil
          perfiles={samplePerfiles}
          onSeleccionar={() => {}}
          cargando={false}
          onRenombrar={onRenombrar}
          onEliminar={() => {}}
        />,
      )
    })

    // Click rename on the first profile (Yo, id=1)
    const renameButtons = container.querySelectorAll('[data-testid="boton-renombrar-perfil"]')
    await act(async () => {
      ;(renameButtons[0] as HTMLButtonElement).click()
    })

    // The row should now show an input pre-filled with the current name
    const input = container.querySelector<HTMLInputElement>(
      '[data-testid="input-renombrar-perfil"]',
    )
    expect(input).not.toBeNull()
    expect(input!.value).toBe('Yo')

    // Type a new name
    await act(async () => {
      typeInto(input!, 'Carlos')
    })

    // Click "Guardar"
    const saveButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="boton-guardar-renombrar"]',
    )
    expect(saveButton).not.toBeNull()
    await act(async () => {
      saveButton!.click()
    })

    expect(onRenombrar).toHaveBeenCalledTimes(1)
    expect(onRenombrar).toHaveBeenCalledWith(1, 'Carlos')
  })
})
