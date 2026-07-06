// Tests for Slice 7 (post-MVP persistencia IPC): TypeScript wrappers
// around the Rust Tauri commands.
//
// Spec:    `openspec/changes/mvp-financiero-local-first/spec.md` §REQ-202
//          (Scenario: "Inserción de nueva transacción" + "Listado de
//          transacciones por usuario" + "Catálogo de categorías").
// Design:  `openspec/changes/mvp-financiero-local-first/design.md` §7
//          (React layer) + §11 (IPC pattern).
// Tasks:   T-202 (Slice 3), T-205 (Slice 3 wiring), T-106 (Slice 2 IPC).
// Test #:  slice 7 / frontend / REQ-202 IPC wrappers (5 tests).
//
// RED PHASE: this file imports `obtenerCategorias`,
// `insertarTransaccion`, and `listarTransacciones` from
// `../tauri-commands`, a module that does NOT exist yet. `pnpm test`
// MUST fail at the import-resolution step before any `it()` block runs.
// That is the expected RED state. The IMPL phase will introduce
// `src/data/tauri-commands.ts` with the wrappers, each of which
// delegates to `invoke<…>(…)` from `@tauri-apps/api/core`.
//
// ## Why we mock `@tauri-apps/api/core`
//
// The wrappers under test are pure TS functions that call `invoke` from
// `@tauri-apps/api/core`. In the renderer (real Tauri runtime) that
// function talks to the Rust backend over the IPC channel; in jsdom
// (where these tests run) it would throw because no Tauri runtime is
// present. Mocking it with `vi.mock` lets us assert the *contract* the
// wrappers have with the Rust side (command name + payload shape) without
// standing up a Tauri process.
//
// ## Pin of signatures for the IMPL phase (from the user's prompt — binding):
//
//   export interface CategoriaDto {
//     id: number
//     nombre: string
//     grupo_pertenencia: 'Ingreso' | 'Gasto'
//   }
//
//   export interface TransaccionCompletaDto {
//     id: number
//     usuario_id: number
//     tipo_flujo: 'Ingreso' | 'Gasto'
//     categoria_id: number
//     categoria_nombre: string
//     concepto: string
//     frecuencia: 'Mensual' | 'Bimensual' | 'Trimestral' | 'Semestral' | 'Anual'
//     comportamiento: 'Fijo' | 'Variable' | null
//     naturaleza_necesidad: 'Necesario' | 'No tan necesario' | 'No necesario' | null
//     valor_centavos: number
//     created_at: number
//     updated_at: number
//   }
//
//   export interface TransaccionInputDto {
//     tipo_flujo: 'Ingreso' | 'Gasto'
//     categoria_id: number
//     concepto: string
//     frecuencia: 'Mensual' | 'Bimensual' | 'Trimestral' | 'Semestral' | 'Anual'
//     comportamiento: 'Fijo' | 'Variable' | null
//     naturaleza_necesidad: 'Necesario' | 'No tan necesario' | 'No necesario' | null
//     valor_centavos: number
//   }
//
//   export async function obtenerCategorias(): Promise<CategoriaDto[]>
//   export async function insertarTransaccion(t: TransaccionInputDto): Promise<number>
//   export async function listarTransacciones(): Promise<TransaccionCompletaDto[]>
//
// IMPORTANT: `listarTransacciones` has no `usuario_id` argument at the
// TS level — the Rust side resolves the active profile (via
// `cmd_obtener_usuario_activo` or similar Slice-2 IPC) and filters by
// it internally. This keeps the React code free of profile plumbing.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Hoisted mock of `@tauri-apps/api/core`. We declare `invoke` as a
// `vi.fn()` so each test can assert call counts + arguments.
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

// Import AFTER the mock declaration so the module under test sees the
// mocked `invoke`. (Vitest hoists `vi.mock` calls to the top of the file
// regardless of source order, but keeping the import here makes the
// intent obvious.)
import { invoke } from '@tauri-apps/api/core'
import {
  insertarTransaccion,
  listarTransacciones,
  obtenerCategorias,
  type CategoriaDto,
  type TransaccionInputDto,
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
  // REQ-202 + REQ-201: `obtenerCategorias` MUST call the Rust command
  // `cmd_obtener_categorias` with no arguments.
  //
  // Given: a successful mock that resolves to `[]`.
  // When:  `obtenerCategorias()` is invoked.
  // Then:  `invoke` is called exactly once with the right command name
  //        and no payload.
  it('slice7_obtener_categorias_invokes_cmd_obtener_categorias', async () => {
    invokeMock.mockResolvedValueOnce([])

    await obtenerCategorias()

    expect(invokeMock).toHaveBeenCalledTimes(1)
    expect(invokeMock).toHaveBeenCalledWith('cmd_obtener_categorias')
  })

  // REQ-201: the wrapper MUST return what the Rust side resolves with,
  // typed as `CategoriaDto[]`. We assert shape + id ordering on a small
  // fixture so the test would also catch a missing field rename.
  //
  // Given: a mock that resolves with two categorias (Ingreso + Gasto).
  // When:  `obtenerCategorias()` is invoked.
  // Then:  the promise resolves to the same array (deep equal) and the
  //        elements match `CategoriaDto`.
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

  // REQ-202: `insertarTransaccion` MUST forward the full input payload
  // to `cmd_insert_transaccion` and return the new id.
  //
  // Given: a valid `TransaccionInputDto` and a mock that resolves to `42`.
  // When:  `insertarTransaccion(input)` is invoked.
  // Then:  `invoke` is called with `'cmd_insert_transaccion'` + the input
  //        object as the second argument, and the wrapper resolves to 42.
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
    expect(invokeMock).toHaveBeenCalledWith('cmd_insert_transaccion', input)
    expect(newId).toBe(42)
  })

  // REQ-202 + REQ-603: `listarTransacciones` MUST call
  // `cmd_listar_transacciones` with no arguments (the Rust side resolves
  // the active profile internally) and return the typed array.
  //
  // Given: a mock that resolves with one fake transaccion.
  // When:  `listarTransacciones()` is invoked.
  // Then:  `invoke` is called with `'cmd_listar_transacciones'` and no
  //        payload, and the wrapper returns the same array.
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

  // REQ-202: error propagation. If the Rust side rejects the IPC call
  // (e.g. the SQL CHECK constraint fires for `valor_centavos = 0`), the
  // wrapper MUST reject too — we never swallow errors.
  //
  // Given: a mock that rejects with a generic Error.
  // When:  `insertarTransaccion(input)` is invoked.
  // Then:  the wrapper's returned promise also rejects with the same Error.
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
    expect(invokeMock).toHaveBeenCalledWith('cmd_insert_transaccion', input)
  })
})