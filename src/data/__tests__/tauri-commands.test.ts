// Tests for Slice 9 (perfil multi-usuario): TypeScript wrappers
// around the 3 new Rust Tauri commands `cmd_obtener_perfiles`,
// `cmd_crear_perfil`, and `cmd_obtener_perfil`.
//
// Spec:    `openspec/changes/mvp-financiero-local-first/spec.md` §REQ-501
//          (selector de perfil al abrir).
// Design:  `openspec/changes/mvp-financiero-local-first/design.md` §7
//          (React layer) + §11 (seccion multi-profile).
// Tasks:   T-501 (frontend wrappers) + T-901 (single-profile lookup).
// Test #:  slice 9 / frontend / REQ-501 wrappers (3 tests) +
//          slice 7 / REQ-202 wrappers (pre-existing 6 tests, slice 8
//          `eliminarTransaccion` wrapper at the bottom).
//
// RED PHASE: this file imports `obtenerPerfiles`, `crearPerfil`, and
// `obtenerPerfil`, and the types `UsuarioDto` / `CrearPerfilInput`,
// from `../tauri-commands`. Those symbols do NOT exist yet (slice 7
// only added CategoriaDto / TransaccionCompletaDto / TransaccionInputDto
// and their wrappers). `pnpm test` MUST fail at the typecheck step
// for this module. That is the expected RED state.
//
// The IMPL phase will introduce in `src/data/tauri-commands.ts`:
//
//   export interface UsuarioDto {
//     id: number
//     nombre: string
//     salario_personal_objetivo_centavos: number
//     modo_mejorado_activo: boolean
//   }
//
//   export interface CrearPerfilInput {
//     nombre: string
//     salario_personal_objetivo_centavos: number
//   }
//
//   export async function obtenerPerfiles(): Promise<UsuarioDto[]>
//   export async function crearPerfil(input: CrearPerfilInput): Promise<number>
//   export async function obtenerPerfil(id: number): Promise<UsuarioDto>
//
// and the wrappers MUST delegate to `invoke<…>(…)` from
// `@tauri-apps/api/core` with the right command name + payload shape.
// See `tauri-commands.ts` docblock for the IPC contract conventions.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Hoisted mock of `@tauri-apps/api/core`. We declare `invoke` as a
// `vi.fn()` so each test can assert call counts + arguments.
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

// Import AFTER the mock declaration so the module under test sees the
// mocked `invoke`. (Vitest hoists `vi.mock` calls to the top of the
// file regardless of source order, but keeping the import here makes
// the intent obvious.)
import { invoke } from '@tauri-apps/api/core'
import {
  crearPerfil,
  eliminarTransaccion,
  insertarTransaccion,
  listarTransacciones,
  obtenerCategorias,
  obtenerPerfil,
  obtenerPerfiles,
  type CategoriaDto,
  type CrearPerfilInput,
  type TransaccionInputDto,
  type UsuarioDto,
} from '../tauri-commands'

// A typed alias for the mock — keeps the test bodies free of casts.
const invokeMock = invoke as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  invokeMock.mockReset()
})

afterEach(() => {
  invokeMock.mockReset()
})

describe('REQ-202 / Slice 7: tauri-commands wrappers (IPC bridge)', () => {
  it('slice7_obtener_categorias_invokes_cmd_obtener_categorias', async () => {
    invokeMock.mockResolvedValueOnce([])

    await obtenerCategorias()

    expect(invokeMock).toHaveBeenCalledTimes(1)
    expect(invokeMock).toHaveBeenCalledWith('cmd_obtener_categorias')
    const callArgs = invokeMock.mock.calls[0]
    expect(callArgs[0]).toBe('cmd_obtener_categorias')
    expect(callArgs[1]).toBeUndefined()
  })

  it('slice7_obtener_categorias_returns_typed_array', async () => {
    const fakeCategorias: CategoriaDto[] = [
      { id: 1, nombre: 'Salario', grupo_pertenencia: 'Ingreso' },
      { id: 5, nombre: 'Hogar', grupo_pertenencia: 'Gasto' },
    ]
    invokeMock.mockResolvedValueOnce(fakeCategorias)

    const result = await obtenerCategorias()

    expect(result).toEqual(fakeCategorias)
    expect(result).toHaveLength(2)
    expect(result[0]?.grupo_pertenencia).toBe('Ingreso')
    expect(result[1]?.grupo_pertenencia).toBe('Gasto')
  })

  it('slice7_insertar_transaccion_invokes_cmd_insert_transaccion_with_input', async () => {
    const input: TransaccionInputDto = {
      tipo_flujo: 'Gasto',
      categoria_id: 6,
      concepto: 'Internet',
      frecuencia: 'Mensual',
      comportamiento: 'Fijo',
      naturaleza_necesidad: 'Necesario',
      valor_centavos: 150_000_000,
    }
    invokeMock.mockResolvedValueOnce(42)

    const newId = await insertarTransaccion(input)

    expect(invokeMock).toHaveBeenCalledTimes(1)
    expect(invokeMock).toHaveBeenCalledWith('cmd_insert_transaccion', { input })
    const callArgs = invokeMock.mock.calls[0]
    expect(callArgs[0]).toBe('cmd_insert_transaccion')
    expect(callArgs[1]).toEqual({ input })
    expect(newId).toBe(42)
  })

  it('slice7_insertar_transaccion_wraps_payload_in_input_key_not_flattened', async () => {
    const payload: TransaccionInputDto = {
      tipo_flujo: 'Gasto',
      categoria_id: 1,
      concepto: 'Test',
      frecuencia: 'Mensual',
      comportamiento: 'Fijo',
      naturaleza_necesidad: 'Necesario',
      valor_centavos: 100_000,
    }
    invokeMock.mockResolvedValueOnce(42)

    await insertarTransaccion(payload)

    const callArgs = invokeMock.mock.calls[0]
    expect(callArgs[0]).toBe('cmd_insert_transaccion')
    expect(callArgs[1]).toEqual({ input: payload })
    expect(callArgs[1]).not.toEqual(payload)
    expect(callArgs[1]).not.toHaveProperty('tipo_flujo')
    expect(callArgs[1]).not.toHaveProperty('valor_centavos')
  })

  it('slice7_listar_transacciones_invokes_cmd_listar_transacciones', async () => {
    const fakeList = [
      {
        id: 7,
        usuario_id: 1,
        tipo_flujo: 'Gasto' as const,
        categoria_id: 6,
        categoria_nombre: 'Hogar',
        concepto: 'Internet',
        frecuencia: 'Mensual' as const,
        comportamiento: 'Fijo' as const,
        naturaleza_necesidad: 'Necesario' as const,
        valor_centavos: 150_000_000,
        created_at: 1700000000,
        updated_at: 1700000000,
      },
    ]
    invokeMock.mockResolvedValueOnce(fakeList)

    const result = await listarTransacciones()

    expect(invokeMock).toHaveBeenCalledTimes(1)
    expect(invokeMock).toHaveBeenCalledWith('cmd_listar_transacciones')
    expect(result).toEqual(fakeList)
    expect(result[0]?.concepto).toBe('Internet')
  })

  it('slice7_insertar_transaccion_propagates_errors', async () => {
    const boom = new Error('constraint failed: valor_centavos > 0')
    invokeMock.mockRejectedValueOnce(boom)

    const input: TransaccionInputDto = {
      tipo_flujo: 'Gasto',
      categoria_id: 6,
      concepto: 'Internet',
      frecuencia: 'Mensual',
      comportamiento: 'Fijo',
      naturaleza_necesidad: 'Necesario',
      valor_centavos: 0,
    }

    await expect(insertarTransaccion(input)).rejects.toBe(boom)
    expect(invokeMock).toHaveBeenCalledTimes(1)
    expect(invokeMock).toHaveBeenCalledWith('cmd_insert_transaccion', { input })
  })
})

describe('REQ-202 / Slice 8: eliminarTransaccion IPC wrapper', () => {
  it('eliminarTransaccion invokes cmd_eliminar_transaccion with id', async () => {
    invokeMock.mockResolvedValueOnce(undefined)

    await eliminarTransaccion(42)

    expect(invokeMock).toHaveBeenCalledTimes(1)
    expect(invokeMock).toHaveBeenCalledWith('cmd_eliminar_transaccion', { id: 42 })
    const callArgs = invokeMock.mock.calls[0]
    expect(callArgs[0]).toBe('cmd_eliminar_transaccion')
    expect(callArgs[1]).toEqual({ id: 42 })
  })
})

// ===========================================================================
// Slice 9: REQ-501 (selector multi-perfil) — wrappers for the 3 new
// profile-related Tauri commands.
// ===========================================================================
//
// Surface tests para `obtenerPerfiles`, `crearPerfil`, `obtenerPerfil`:
// todas delegan en `invoke<…>` con el nombre de comando exacto y el
// shape del payload exigido por el lado Rust. Ver el binding del IMPL
// en la cabecera de este archivo.
//
// ===========================================================================

describe('REQ-501 / Slice 9: profile IPC wrappers', () => {
  // REQ-501 / Scenario "Selector de perfil al iniciar":
  // `obtenerPerfiles()` MUST call `cmd_obtener_perfiles` with NO payload
  // (the command takes only the AppHandle; there is no Rust-side state
  // to pass). Returns the array of all `UsuarioDto`s in the DB.
  //
  // Given: the IPC mock resolves with an empty array (no profiles yet,
  //        which is the initial state on first launch).
  // When:  `obtenerPerfiles()` is invoked.
  // Then:  `invoke` is called exactly once with `'cmd_obtener_perfiles'`
  //        and no payload; the wrapper resolves to the same array.
  it('obtenerPerfiles invokes cmd_obtener_perfiles', async () => {
    invokeMock.mockResolvedValueOnce([])

    const result = await obtenerPerfiles()

    expect(invokeMock).toHaveBeenCalledTimes(1)
    expect(invokeMock).toHaveBeenCalledWith('cmd_obtener_perfiles')
    // Strengthened: no payload (the Rust command has only `app`, which
    // Tauri injects automatically).
    const callArgs = invokeMock.mock.calls[0]
    expect(callArgs[0]).toBe('cmd_obtener_perfiles')
    expect(callArgs[1]).toBeUndefined()
    expect(result).toEqual([])
  })

  // REQ-501 / Scenario "Selector de perfil al iniciar" +
  // "Aislamiento de datos por perfil": `crearPerfil(input)` MUST forward
  // the full input payload to `cmd_crear_perfil` (the Rust command takes
  // `(app, nombre, salario_personal_objetivo_centavos)` — Tauri v2 maps
  // each top-level key of the payload object to a parameter by name, so
  // the wrapper MUST pass the input under a key that the Rust side
  // declares). The binding pins the wrapper signature as
  // `export async function crearPerfil(input: CrearPerfilInput)`.
  //
  // Given: a valid `CrearPerfilInput` and a mock resolving to `2`
  //        (the new autoincrement id).
  // When:  `crearPerfil({nombre, salario})` is invoked.
  // Then:  `invoke` is called with `'cmd_crear_perfil'` and a payload
  //        wrapping the input under a recognized key (the IMPL pin is
  //        `{ input: ... }`, same shape as `insertarTransaccion`).
  it('crearPerfil invokes cmd_crear_perfil with input', async () => {
    const input: CrearPerfilInput = {
      nombre: 'Maria',
      salario_personal_objetivo_centavos: 60_000_000,
    }
    invokeMock.mockResolvedValueOnce(2)

    const newId = await crearPerfil(input)

    expect(invokeMock).toHaveBeenCalledTimes(1)
    expect(invokeMock).toHaveBeenCalledWith('cmd_crear_perfil', {
      input: { nombre: 'Maria', salario_personal_objetivo_centavos: 60_000_000 },
    })
    const callArgs = invokeMock.mock.calls[0]
    expect(callArgs[0]).toBe('cmd_crear_perfil')
    expect(callArgs[1]).toEqual({ input })
    expect(callArgs[1]).not.toHaveProperty('nombre')
    expect(callArgs[1]).not.toHaveProperty('salario_personal_objetivo_centavos')
    expect(newId).toBe(2)
  })

  // REQ-501: `obtenerPerfil(id)` MUST call `cmd_obtener_perfil` with
  // `{ id }` (top-level `id` key, same shape as `eliminarTransaccion`)
  // and return a single `UsuarioDto`.
  //
  // Given: a mock that resolves with the 'Yo' profile (id=1,
  //        salario=50_000_000, modo_mejorado=false).
  // When:  `obtenerPerfil(1)` is invoked.
  // Then:  `invoke` is called with `'cmd_obtener_perfil'` and `{ id: 1 }`;
  //        the wrapper resolves to the same `UsuarioDto`.
  it('obtenerPerfil invokes cmd_obtener_perfil with id', async () => {
    const yo: UsuarioDto = {
      id: 1,
      nombre: 'Yo',
      salario_personal_objetivo_centavos: 50_000_000,
      modo_mejorado_activo: false,
    }
    invokeMock.mockResolvedValueOnce(yo)

    const result = await obtenerPerfil(1)

    expect(invokeMock).toHaveBeenCalledTimes(1)
    expect(invokeMock).toHaveBeenCalledWith('cmd_obtener_perfil', { id: 1 })
    const callArgs = invokeMock.mock.calls[0]
    expect(callArgs[0]).toBe('cmd_obtener_perfil')
    expect(callArgs[1]).toEqual({ id: 1 })
    expect(result).toEqual(yo)
    expect(result.nombre).toBe('Yo')
    expect(result.modo_mejorado_activo).toBe(false)
  })
})
