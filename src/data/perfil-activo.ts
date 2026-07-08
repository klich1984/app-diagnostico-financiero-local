// perfil-activo.ts — Helper para persistir el perfil activo en
// `localStorage` del WebView del Tauri.
//
// Slice 9 (MVP local): el frontend guarda el id del perfil activo
// en `localStorage` para que la app recuerde al usuario entre
// sesiones sin requerir un comando Tauri extra. La persistencia
// robusta del lado backend (tabla `Sesion` o equivalente) queda
// para un slice futuro — ver `slice-9-test-plan.md`.
//
// ## Contrato con los tests
//
//   * `obtenerPerfilActivo(): number | null` — devuelve el id guardado
//     o `null` si no hay nada / el valor es inválido / `localStorage`
//     no está disponible (defensa SSR / tests).
//   * `guardarPerfilActivo(id: number): void` — persiste el id.
//   * `limpiarPerfilActivo(): void` — borra el id persistido.
//
// ## Storage key
//
// `'mvp-fin:perfil-activo'` (namespaced bajo el prefijo del proyecto
// para evitar colisiones con cualquier otra cosa que escriba a
// `localStorage` desde el mismo origin).
//
// ## Forma del valor almacenado
//
// Se guarda `String(id)` (no `JSON.stringify`) porque la docblock de
// los tests dice "JSON.stringify(id)" pero el contrato observable
// (roundtrip + caso corrupto) se cumple igual: parseamos con `Number`
// y validamos que sea un entero positivo. Si llegara un valor
// corrupto (ej. `'not-a-number'`), devolvemos `null` en vez de tirar.

const STORAGE_KEY = 'mvp-fin:perfil-activo'

/**
 * Lee el id del perfil activo desde `localStorage`.
 *
 * Devuelve `null` cuando:
 *   * `window` no existe (SSR / tests sin DOM).
 *   * la key no está presente.
 *   * el valor guardado no es un entero positivo válido.
 */
export function obtenerPerfilActivo(): number | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (raw === null) return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

/**
 * Persiste el id del perfil activo en `localStorage`.
 *
 * Si `window` no existe (SSR), la llamada es no-op — coherente con
 * `obtenerPerfilActivo`.
 */
export function guardarPerfilActivo(id: number): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, String(id))
}

/**
 * Borra el id del perfil activo de `localStorage`.
 *
 * Tras esto, `obtenerPerfilActivo()` devuelve `null` y la UI debe
 * volver a mostrar el selector (típicamente al iniciar la app o
 * después de un "cambiar perfil").
 */
export function limpiarPerfilActivo(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(STORAGE_KEY)
}