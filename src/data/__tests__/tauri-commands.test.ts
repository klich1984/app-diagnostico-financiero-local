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
  eliminarSimulacion,
  eliminarTransaccion,
  insertarTransaccion,
  listarTransacciones,
  obtenerCategorias,
  obtenerPerfil,
  obtenerPerfiles,
  obtenerSimulaciones,
  upsertSimulacion,
  type CategoriaDto,
  type CrearPerfilInput,
  type TransaccionCompletaDto,
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

// ===========================================================================
// Slice 11: REQ-602 + REQ-603 — wrappers for the 3 new Simulador
// Tauri commands (`cmd_listar_simulaciones`, `cmd_upsert_simulacion`,
// `cmd_eliminar_simulacion`).
// ===========================================================================
//
// Surface tests para `obtenerSimulaciones`, `upsertSimulacion` y
// `eliminarSimulacion`: todas delegan en `invoke<…>` con el nombre de
// comando exacto y el shape del payload exigido por el lado Rust.
//
// DTOs y wrappers que el IMPL debe agregar a `tauri-commands.ts`:
//
//   export interface SimulacionCompletaDto {
//     id: number
//     usuario_id: number
//     transaccion_id: number
//     nuevo_valor_centavos: number
//     created_at: number
//     updated_at: number
//   }
//
//   export interface UpsertSimulacionInput {
//     transaccionId: number
//     nuevoValorCentavos: number
//     usuarioId: number
//   }
//
//   export async function obtenerSimulaciones(
//     usuarioId: number,
//   ): Promise<SimulacionCompletaDto[]>
//
//   export async function upsertSimulacion(
//     input: UpsertSimulacionInput,
//   ): Promise<number>
//
//   export async function eliminarSimulacion(
//     transaccionId: number,
//   ): Promise<void>
//
// ===========================================================================

describe('REQ-602 / Slice 11: Simulador IPC wrappers', () => {
  // REQ-602 (slice 11 / frontend):
  // `obtenerSimulaciones(usuarioId)` MUST call
  // `cmd_listar_simulaciones` with the `usuarioId` as a top-level key
  // (the Rust command takes it as a positional i64), and return the
  // array of `SimulacionCompletaDto`. Initial state on a fresh DB is
  // an empty array.
  //
  // Given: a mock that resolves with an empty `SimulacionCompletaDto[]`.
  // When:  `obtenerSimulaciones(1)` is invoked.
  // Then:  `invoke` is called with `'cmd_listar_simulaciones'` and
  //        `{ usuarioId: 1 }`.
  it('obtenerSimulaciones invokes cmd_listar_simulaciones', async () => {
    invokeMock.mockResolvedValueOnce([])

    const result = await obtenerSimulaciones(1)

    expect(invokeMock).toHaveBeenCalledTimes(1)
    expect(invokeMock).toHaveBeenCalledWith('cmd_listar_simulaciones', {
      usuarioId: 1,
    })
    const callArgs = invokeMock.mock.calls[0]
    expect(callArgs[0]).toBe('cmd_listar_simulaciones')
    expect(callArgs[1]).toEqual({ usuarioId: 1 })
    expect(result).toEqual([])
  })

  // REQ-602 (slice 11 / frontend, upsert): the wrapper MUST forward the
  // full input under `{ input: ... }` (mirroring `insertarTransaccion`),
  // so the Rust command can deserialize it with Tauri v2's
  // `{ input }` payload convention. The mock resolves to `42`
  // (a placeholder autoincrement id).
  //
  // Given: a valid `UpsertSimulacionInput` payload.
  // When:  `upsertSimulacion({transaccionId, nuevoValorCentavos, usuarioId})`
  //        is invoked.
  // Then:  `invoke` is called with `'cmd_upsert_simulacion'` and
  //        `{ input: { transaccionId, nuevoValorCentavos, usuarioId } }`,
  //        and the promise resolves to the new id.
  it('upsertSimulacion invokes cmd_upsert_simulacion with input', async () => {
    invokeMock.mockResolvedValueOnce(42)

    const newId = await upsertSimulacion({
      transaccionId: 1,
      nuevoValorCentavos: 100_000,
      usuarioId: 1,
    })

    expect(invokeMock).toHaveBeenCalledTimes(1)
    expect(invokeMock).toHaveBeenCalledWith('cmd_upsert_simulacion', {
      input: {
        transaccionId: 1,
        nuevoValorCentavos: 100_000,
        usuarioId: 1,
      },
    })
    const callArgs = invokeMock.mock.calls[0]
    expect(callArgs[0]).toBe('cmd_upsert_simulacion')
    expect(callArgs[1]).toEqual({
      input: {
        transaccionId: 1,
        nuevoValorCentavos: 100_000,
        usuarioId: 1,
      },
    })
    // Belt-and-braces: ensure the wrapper does NOT flatten the payload
    // (matches the project's IPC convention pinned by slice 7 + 9).
    expect(callArgs[1]).not.toHaveProperty('transaccionId')
    expect(callArgs[1]).not.toHaveProperty('nuevoValorCentavos')
    expect(newId).toBe(42)
  })

  // REQ-602 (slice 11 / frontend, delete): `eliminarSimulacion(id)`
  // MUST call `cmd_eliminar_simulacion` with `{ transaccionId: id }`
  // (top-level, same shape as `eliminarTransaccion`). Returns `void`.
  //
  // Given: a mock that resolves to `undefined`.
  // When:  `eliminarSimulacion(7)` is invoked.
  // Then:  `invoke` is called with `'cmd_eliminar_simulacion'` and
  //        `{ transaccionId: 7 }`.
  it('eliminarSimulacion invokes cmd_eliminar_simulacion', async () => {
    invokeMock.mockResolvedValueOnce(undefined)

    await eliminarSimulacion(7)

    expect(invokeMock).toHaveBeenCalledTimes(1)
    expect(invokeMock).toHaveBeenCalledWith('cmd_eliminar_simulacion', {
      transaccionId: 7,
    })
    const callArgs = invokeMock.mock.calls[0]
    expect(callArgs[0]).toBe('cmd_eliminar_simulacion')
    expect(callArgs[1]).toEqual({ transaccionId: 7 })
  })
})

// ===========================================================================
// Slice 11 bugfix: TransaccionCompletaDto fields accept `undefined` so the
// DTO is assignable to `TransaccionMin` (which uses `undefined` instead of
// `null` for `comportamiento` and `naturaleza_necesidad`).
//
// Root cause: the Rust side stores SQL `NULL` for the optional columns
// (cross-column CHECK forces them to NULL for Ingreso), and serde deserializes
// that as JSON `null`. The original TS DTO declared `comportamiento: 'Fijo' |
// 'Variable' | null` — strict null — which made it incompatible with
// `TransaccionMin`'s `'Fijo' | 'Variable' | undefined` and forced the
// `calcularMatriz` call site to use `as never` casts.
//
// The fix widens the DTO to `| null | undefined`. The `undefined` is the
// strict-TS-friendly "absent" marker that the agregador understands; `null`
// is the JSON-deserialized marker that the backend actually emits. Both
// must be assignable so the DTO can flow into the domain modules without
// lossy casts.
// ===========================================================================

describe('REQ-602 / Slice 11 bugfix: TransaccionCompletaDto nullability contract', () => {
  // The whole point of the bugfix: the DTO MUST accept `undefined` for
  // the optional enum fields so it is structurally assignable to
  // `TransaccionMin` (which uses `undefined`). If a future refactor
  // narrows this back to `| null`, this test stops compiling — that's
  // the regression guard.
  //
  // NOTE: we don't import the type dynamically (esbuild + Vitest do not
  // support `import('...').type`). The top-level import already pulls
  // the type in via the slice 11 fixture data; we just use the alias
  // here. The compile-time check is what we care about.
  it('TransaccionCompletaDto fields accept undefined for backward compat with TransaccionMin', () => {
    const t: TransaccionCompletaDto = {
      id: 1,
      usuario_id: 1,
      tipo_flujo: 'Gasto',
      categoria_id: 5,
      categoria_nombre: 'Hogar',
      concepto: 'Arriendo',
      frecuencia: 'Mensual',
      // accept undefined (not just null) — key for TransaccionMin assignability
      comportamiento: undefined,
      naturaleza_necesidad: undefined,
      valor_centavos: 1_700_000,
      created_at: 1,
      updated_at: 1,
    }
    // The test is mostly a typecheck — TS compiles if the contract works.
    expect(t.comportamiento).toBeUndefined()
    expect(t.naturaleza_necesidad).toBeUndefined()
  })

  // Belt-and-braces: `null` (the value Rust actually emits) MUST still be
  // accepted. The DTO stays compatible with the raw JSON payload AND with
  // the strict-TS domain type.
  it('TransaccionCompletaDto fields still accept null (JSON null from Rust)', () => {
    const t: TransaccionCompletaDto = {
      id: 1,
      usuario_id: 1,
      tipo_flujo: 'Ingreso',
      categoria_id: 1,
      categoria_nombre: 'Salario',
      concepto: 'Sueldo',
      frecuencia: 'Mensual',
      comportamiento: null,
      naturaleza_necesidad: null,
      valor_centavos: 15_000_000,
      created_at: 1,
      updated_at: 1,
    }
    expect(t.comportamiento).toBeNull()
    expect(t.naturaleza_necesidad).toBeNull()
  })
})
