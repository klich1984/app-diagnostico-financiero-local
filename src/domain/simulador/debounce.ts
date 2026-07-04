// MVP Financiero - debounce + flush-on-close para el Panel Simulador
// (REQ-402).
//
// Ver `openspec/changes/mvp-financiero-local-first/spec.md` §REQ-402 y
// `design.md` §10.2 (debounce de escritura) + §10.3 (flush-on-close).
//
// El Panel Simulador dispara una propuesta a SQLite cada vez que el
// usuario mueve un slider. Sin debounce eso sería una lluvia de
// escrituras (decenas por segundo mientras se arrastra); con este
// módulo se coalescen en una sola escritura al "quiescence" — y se
// garantiza que el último valor antes de cerrar la página se persiste
// (vía `flush()` en el handler `beforeunload` / cleanup del efecto).
//
// Decisiones de diseño:
//   * Se usa `setTimeout`/`clearTimeout` nativos (no `requestIdleCallback`
//     ni nada basado en `MessageChannel`). Eso permite que Vitest los
//     intercepte con `vi.useFakeTimers()` + `vi.advanceTimersByTime()`,
//     que es como el test de slice 5 controla el tiempo
//     determinísticamente.
//   * `fn` puede devolver `void` o `Promise<void>`. El debounce NO
//     espera la resolución — el caller decide cómo reportar errores
//     (p. ej. snack-bar de "no se pudo guardar"). Eso evita bloquear
//     la cola de timers y mantiene el comportamiento predecible ante
//     `fn` async.
//   * El estado se mantiene en el closure; NO se usa `useRef` ni nada
//     de React. Esto hace al módulo 100 % reutilizable fuera de React
//     (p. ej. en comandos IPC directos desde el main process).

/**
 * Handle devuelto por `createDebouncedCallback`. Modela los tres
 * verbos que la UI del Panel Simulador necesita:
 *   * `call(v)`  — programar la llamada con el valor `v`.
 *   * `flush()`  — ejecutar AHORA la llamada pendiente (no-op si nada
 *                  está pendiente).
 *   * `cancel()` — descartar la llamada pendiente.
 *
 * Los tres son idempotentes y se pueden llamar en cualquier orden.
 */
export interface DebouncedCallback<T> {
  call(value: T): void
  flush(): void
  cancel(): void
}

/**
 * Crea un `DebouncedCallback<T>` que invoca `fn` con el ÚLTIMO valor
 * recibido tras un periodo de inactividad de `delayMs` milisegundos.
 *
 * Reglas de comportamiento:
 *   * `call(v)` reinicia el timer si ya había uno pendiente — solo el
 *     último valor sobrevive al quiescence.
 *   * `flush()` ejecuta la llamada pendiente SINCRONICAMENTE y limpia
 *     el timer; tras `flush()`, avanzar el tiempo no vuelve a
 *     disparar `fn`.
 *   * `cancel()` descarta la llamada pendiente; tras `cancel()`,
 *     avanzar el tiempo no dispara `fn`.
 *
 * @param fn       Función a invocar (puede ser sync o async; su
 *                 resultado no se espera).
 * @param delayMs  Milisegundos de inactividad antes de invocar `fn`.
 */
export function createDebouncedCallback<T>(
  fn: (value: T) => void | Promise<void>,
  delayMs: number,
): DebouncedCallback<T> {
  // Identificador del timer activo (o `null` si no hay ninguno).
  let timer: ReturnType<typeof setTimeout> | null = null
  // Último valor recibido y aún no enviado a `fn`.
  let pendingValue: T | null = null
  // Bandera explícita: permite distinguir "no hay nada pendiente"
  // de "pendingValue es null/undefined" (un valor legítimo).
  let hasPending = false

  function call(value: T): void {
    pendingValue = value
    hasPending = true
    if (timer !== null) {
      clearTimeout(timer)
    }
    timer = setTimeout(() => {
      // El timer disparó: limpiar estado y ejecutar.
      timer = null
      if (hasPending) {
        const v = pendingValue as T
        pendingValue = null
        hasPending = false
        // El test usa `vi.fn()` síncrono; envolvemos en `void` para
        // ignorar el eventual Promise sin warnings.
        void fn(v)
      }
    }, delayMs)
  }

  function flush(): void {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
    if (hasPending) {
      const v = pendingValue as T
      pendingValue = null
      hasPending = false
      void fn(v)
    }
  }

  function cancel(): void {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
    pendingValue = null
    hasPending = false
  }

  return { call, flush, cancel }
}