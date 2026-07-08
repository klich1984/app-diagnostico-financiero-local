// Tests for Slice 9 (perfil multi-usuario): localStorage helper
// `perfil-activo.ts` that tracks the active profile id across
// React component remounts and full app restarts.
//
// Spec:    `openspec/changes/mvp-financiero-local-first/spec.md` §REQ-501
//          (selector de perfil al abrir; el perfil activo debe
//          persistir entre sesiones en el MVP local-first) + §REQ-603
//          (soporte multi-perfil).
// Design:  `openspec/changes/mvp-financiero-local-first/design.md` §11
//          (seccion multi-profile — persistencia via `localStorage`
//          para el MVP, con TODO para backend).
// Tasks:   T-501 (frontend selector + storage).
// Test #:  slice 9 / frontend / REQ-501 localStorage helper (4 tests).
//
// RED PHASE: this file imports `obtenerPerfilActivo`,
// `guardarPerfilActivo`, and `limpiarPerfilActivo` from
// `../perfil-activo`, a module that does NOT exist yet. Vitest will
// fail to resolve the import. That is the expected RED state.
//
// The IMPL phase will introduce `src/data/perfil-activo.ts` with:
//
//   export function obtenerPerfilActivo(): number | null
//   export function guardarPerfilActivo(id: number): void
//   export function limpiarPerfilActivo(): void
//
// Storage key: `'mvp-fin:perfil-activo'` (namespaced under the
// project prefix to avoid collisions with anything else that writes
// to `localStorage` from the same origin).
//
// Contrato de la implementacion:
//   * `obtenerPerfilActivo` MUST return `null` when the key is absent,
//     when the stored value is not a valid JSON number, OR when
//     `localStorage` is unavailable (e.g. SSR-safety).
//   * `guardarPerfilActivo(id)` MUST store the id as `JSON.stringify(id)`
//     so reading it back via `JSON.parse(...)` recovers the original number.
//   * `limpiarPerfilActivo` MUST remove the key entirely (so the next
//     `obtenerPerfilActivo` returns `null` cleanly).
//
// These tests use the jsdom `localStorage` (provided by Vitest's default
// environment) — no Tauri runtime, no IPC.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  guardarPerfilActivo,
  limpiarPerfilActivo,
  obtenerPerfilActivo,
} from '../perfil-activo'

const STORAGE_KEY = 'mvp-fin:perfil-activo'

beforeEach(() => {
  // Each test starts from a clean slate. We use `localStorage.clear()`
  // (not per-key removal) so a regression that picks a different key
  // would still start fresh.
  localStorage.clear()
})

afterEach(() => {
  localStorage.clear()
})

describe('REQ-501 / Slice 9: perfil-activo localStorage helper', () => {
  // REQ-501: when no profile has been saved, `obtenerPerfilActivo` MUST
  // return `null` (NOT `undefined`, NOT `0`, NOT `'0'`). The caller uses
  // a `=== null` check to decide whether to show the full-screen
  // selector overlay vs the inline switcher.
  //
  // Given: an empty `localStorage` (no key present).
  // When:  `obtenerPerfilActivo()` is called.
  // Then:  it returns `null`.
  it('obtenerPerfilActivo returns null when no profile is saved', () => {
    expect(obtenerPerfilActivo()).toBeNull()
  })

  // REQ-501 (Scenario "Selector de perfil al iniciar"): the active
  // profile id MUST survive a remount/restart via `localStorage`.
  // The roundtrip MUST preserve the EXACT number (no off-by-one, no
  // string coercion).
  //
  // Given: a freshly-cleared `localStorage`.
  // When:  `guardarPerfilActivo(42)` is called, then `obtenerPerfilActivo()`.
  // Then:  the value recovered is `42`.
  it('guardarPerfilActivo + obtenerPerfilActivo roundtrips', () => {
    guardarPerfilActivo(42)
    expect(obtenerPerfilActivo()).toBe(42)
  })

  // REQ-501: `limpiarPerfilActivo` MUST remove the stored profile,
  // restoring the "no active profile" state. The selector overlay
  // will re-appear on next load.
  //
  // Given: a saved profile (id=42).
  // When:  `limpiarPerfilActivo()` is called, then `obtenerPerfilActivo()`.
  // Then:  the value recovered is `null`.
  it('limpiarPerfilActivo removes the saved profile', () => {
    guardarPerfilActivo(42)
    expect(obtenerPerfilActivo()).toBe(42) // sanity: the setup worked

    limpiarPerfilActivo()

    expect(obtenerPerfilActivo()).toBeNull()
  })

  // REQ-501 / robustness: if `localStorage` contains a corrupt value
  // (e.g. a previous version of the app stored something else there,
  // or a user manually edited DevTools), `obtenerPerfilActivo` MUST
  // NOT throw — it MUST return `null` so the selector overlay can fix
  // the state on next interaction.
  //
  // Given: `localStorage` has the project key set to the literal
  //        string `'not-a-number'` (valid JSON would be `42` or `"42"`;
  //        this is intentionally invalid).
  // When:  `obtenerPerfilActivo()` is called.
  // Then:  it returns `null` and does NOT throw.
  it('obtenerPerfilActivo returns null when localStorage has invalid JSON', () => {
    localStorage.setItem(STORAGE_KEY, 'not-a-number')

    // Defensive: assert the helper does not throw. We wrap in an
    // immediately-invoked function so a thrown error fails the test
    // (rather than crashing the test runner).
    expect(() => obtenerPerfilActivo()).not.toThrow()
    expect(obtenerPerfilActivo()).toBeNull()
  })
})
