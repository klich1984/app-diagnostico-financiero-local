// ModalSalarioObjetivo — organism de Atomic Design para editar el
// salario personal objetivo del perfil activo desde la UI
// (HU-502 / REQ-502 continuación, Slice A).
//
// Ver `design.md` §1.1 (contrato del componente) y `tasks.md` T-502.
// El organism es DUMB salvo por su propio state local de UI (inputTexto,
// errorValidacion, errorIpc, guardando). Toda persistencia y refresh del
// state global la orquesta el padre (`EstadoResultadosPanel` + `App.tsx`).
//
// ## Reglas del proyecto aplicadas
//
//   * Idioma: español neutro LATAM, sin voseo, formalidad "tú".
//   * Atomic Design: este archivo es un `organisms`. No se crea `src/pages/`.
//   * Precisión: `parsePesosInput` + `formatCentavos` (ya existentes en
//     `src/domain/precision/money.ts`) — no se duplica lógica de moneda.
//   * Sin dependencias nuevas (no `@testing-library/react`, no react-router).
//
// ## Contrato de `data-testid` (binding con el test file)
//
//   * `modal-salario-objetivo`      — root container (modal card)
//   * `modal-salario-input`         — input numérico
//   * `modal-salario-error`         — slot de mensaje de error inline
//   * `modal-salario-guardar`       — botón "Guardar"
//   * `modal-salario-cancelar`      — botón "Cancelar"
//
// El backdrop del modal NO tiene testid porque no hay test que lo ejercite
// directamente (UX accessibility extra).

import { useEffect, useState } from 'react'
import { formatCentavos, parsePesosInput } from '../../domain/precision/money'

// Límite duro del modal: $1.000.000.000 pesos = 100.000.000.000 centavos.
// El backend también lo enforza (defensa en profundidad).
const MAX_CENTAVOS = 100_000_000_000

export interface ModalSalarioObjetivoProps {
  /** Salario objetivo actual del perfil activo en centavos. `null` = sin perfil. */
  salarioActualCentavos: number | null
  /** Persiste el nuevo valor. Resuelve cuando termina (éxito o error). */
  onGuardar: (centavos: number) => Promise<void>
  /** Cierra el modal sin persistir (click en Cancelar o backdrop). */
  onCancelar: () => void
  /** ID del perfil activo. Si es `null`, el modal NO se renderiza. */
  perfilActivoId: number | null
}

export function ModalSalarioObjetivo({
  salarioActualCentavos,
  onGuardar,
  onCancelar,
  perfilActivoId,
}: ModalSalarioObjetivoProps): JSX.Element | null {
  // State local de UI.
  const [inputTexto, setInputTexto] = useState<string>(() =>
    salarioActualCentavos !== null ? formatCentavos(salarioActualCentavos) : '',
  )
  const [errorValidacion, setErrorValidacion] = useState<string | null>(null)
  const [errorIpc, setErrorIpc] = useState<string | null>(null)
  const [guardando, setGuardando] = useState<boolean>(false)

  // Reglas de validación síncronas (corren en cada keystroke o al click
  // en Guardar). El mensaje de error se muestra inline y Guardar queda
  // deshabilitado SOLO cuando el input está vacío (REQ-502-D1-4).
  // Las funciones helper se definen ANTES de los hooks para mantener la
  // regla de Hooks (todos los hooks deben ejecutarse en cada render antes
  // de cualquier return condicional).
  function validar(texto: string): { ok: true; centavos: number } | { ok: false; mensaje: string } {
    const trimmed = texto.trim()
    if (trimmed === '') {
      return { ok: false, mensaje: 'Ingresa un valor' }
    }
    const centavos = parsePesosInput(trimmed)
    if (centavos === null) {
      // parsePesosInput rechaza vacío, no-numérico y negativo.
      return { ok: false, mensaje: 'El valor no puede ser negativo' }
    }
    if (centavos > MAX_CENTAVOS) {
      return { ok: false, mensaje: 'El valor excede el máximo permitido' }
    }
    return { ok: true, centavos }
  }

  function onChangeInput(e: React.ChangeEvent<HTMLInputElement>): void {
    const texto = e.target.value.replace(/[^0-9.,\-]/g, '')
    setInputTexto(texto)
    // Limpia el error de IPC al re-editar (REQ-502-D1-9 no lo pinea pero
    // es UX consistente).
    if (errorIpc !== null) setErrorIpc(null)
    // Validación reactiva: solo actualiza errorValidacion, no bloquea input.
    const result = validar(texto)
    setErrorValidacion(result.ok ? null : result.mensaje)
  }

  async function handleGuardar(): Promise<void> {
    const result = validar(inputTexto)
    if (!result.ok) {
      setErrorValidacion(result.mensaje)
      return
    }

    setGuardando(true)
    setErrorIpc(null)
    try {
      await onGuardar(result.centavos)
      // Éxito: el padre cierra el modal (`onCancelar` se invoca desde
      // `EstadoResultadosPanel` cuando el `setSalarioObjetivoCentavos`
      // se completa). El componente se va a desmontar; no reseteamos
      // state.
    } catch (err) {
      // Error IPC: el modal NO se cierra (REQ-502-D1-9).
      const mensaje = err instanceof Error ? err.message : 'Error desconocido al guardar'
      setErrorIpc(mensaje)
      setGuardando(false)
    }
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>): void {
    // Cerrar solo si el click fue en el backdrop, NO en la card.
    if (e.target === e.currentTarget && !guardando) {
      onCancelar()
    }
  }

  // El error visible es la unión de validación e IPC. El test busca el
  // texto combinado en `data-testid="modal-salario-error"`.
  const mensajeErrorVisible = errorIpc ?? errorValidacion
  const inputVacio = inputTexto.trim() === ''
  const guardarDisabled = inputVacio || guardando

  // useEffect: si cambia el salario actual externamente (ej. reload desde DB),
  // sincronizamos el input. Solo cuando NO estamos guardando para no pisar
  // lo que el usuario está tipeando.
  useEffect(() => {
    if (guardando) return
    setInputTexto(salarioActualCentavos !== null ? formatCentavos(salarioActualCentavos) : '')
    setErrorValidacion(null)
    setErrorIpc(null)
  }, [salarioActualCentavos, guardando])

  // Regla del contrato: si no hay perfil activo, el modal no se renderiza.
  // El padre también cierra el modal cuando cambia el perfilActivo, pero
  // este guard evita flicker entre el cambio de perfil y el re-render del
  // padre (REQ-502-D1-8 + REQ-502-D1-11).
  // IMPORTANTE: este return debe ir DESPUÉS de todos los hooks (regla de
  // Hooks de React) — ya está después del useEffect de arriba.
  if (perfilActivoId === null) {
    return null
  }

  return (
    <div
      data-testid="modal-salario-objetivo"
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-salario-titulo"
    >
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 id="modal-salario-titulo" className="text-lg font-semibold text-slate-900">
          Editar salario personal objetivo
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Este valor se descuenta del Flujo de Ahorro 2 en el Estado de Resultados Mejorado.
        </p>

        <div className="mt-4">
          <label htmlFor="modal-salario-input" className="block text-sm font-medium text-slate-700">
            Salario objetivo (pesos)
          </label>
          <input
            id="modal-salario-input"
            data-testid="modal-salario-input"
            type="text"
            inputMode="numeric"
            value={inputTexto}
            onChange={onChangeInput}
            disabled={guardando}
            placeholder="0"
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-slate-500 focus:outline-none disabled:bg-slate-100"
          />
        </div>

        {mensajeErrorVisible !== null ? (
          <p data-testid="modal-salario-error" className="mt-2 text-sm text-red-700" role="alert">
            {mensajeErrorVisible}
          </p>
        ) : null}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            data-testid="modal-salario-cancelar"
            onClick={onCancelar}
            disabled={guardando}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:border-slate-500 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            data-testid="modal-salario-guardar"
            onClick={handleGuardar}
            disabled={guardarDisabled}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
