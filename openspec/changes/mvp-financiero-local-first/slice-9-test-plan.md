# Slice 9 — Plan de Tests (Fase RED)

**Cambio**: `mvp-financiero-local-first`
**Slice**: 9 (selector de perfil multi-usuario)
**Fecha**: 2026-07-08
**Fase**: RED del ciclo TDD

## REQs cubiertos

- **REQ-501** — Selector de perfil al abrir la aplicacion
- **REQ-603** — Soporte multi-perfil (aislamiento de transacciones)

> Nota: REQ-501 no existe como REQ propio en el `spec.md` actual; se
> interpreta como el escenario "Selector de perfil al iniciar" del
> REQ-603, que dice literalmente: "se muestra un selector de perfil
> obligatorio". Slice 9 implementa esa pieza.

## Archivos modificados / creados (4 archivos)

| # | Archivo | Tipo | Tests | Estado RED |
|---|---------|------|-------|------------|
| 1 | `src-tauri/tests/commands_test.rs` | modificado | 4 nuevos | no compila (`cargo test --no-run` falla con `unresolved imports` de `cmd_*_perfil*_impl` y `UsuarioDto`) |
| 2 | `src/data/__tests__/tauri-commands.test.ts` | modificado | 3 nuevos | los tests fallan en runtime (`TypeError: ... is not a function`); los wrappers `obtenerPerfiles`/`crearPerfil`/`obtenerPerfil` no existen |
| 3 | `src/data/__tests__/perfil-activo.test.ts` | nuevo | 4 | falla a nivel de archivo (no se puede resolver `../perfil-activo`) |
| 4 | `src/components/organisms/__tests__/SelectorPerfil.test.tsx` | nuevo | 5 | falla a nivel de archivo (no se puede resolver `../SelectorPerfil`) |

**Total**: **16 tests** nuevos en 4 archivos (4 Rust + 3 TS wrapper + 4 localStorage + 5 component).

## Detalle por archivo

### 1) `src-tauri/tests/commands_test.rs` (4 tests nuevos)

Tests del binding que la IMPL debe satisfacer en `crate::commands`:

| Test | Comando | Contrato esperado |
|------|---------|-------------------|
| `req_501_cmd_obtener_perfiles_returns_all_usuarios` | `cmd_obtener_perfiles_impl(&Connection)` | Devuelve `Vec<UsuarioDto>` con >=1 elemento; incluye el sembrado `'Yo'` |
| `req_501_cmd_crear_perfil_inserts_new_usuario` | `cmd_crear_perfil_impl(&Connection, nombre, salario_centavos)` | Inserta fila, devuelve `id > 0`, aparece en el listado |
| `req_501_cmd_crear_perfil_rejects_empty_nombre` | mismo | Devuelve `Err(_)` por CHECK `length(trim(nombre)) > 0`; no inserta |
| `req_501_cmd_obtener_perfil_returns_by_id` | `cmd_obtener_perfil_impl(&Connection, id)` | Devuelve el DTO del sembrado `'Yo'` con `salario_personal_objetivo_centavos == 50_000_000` |

DTO esperado:
```rust
#[derive(serde::Serialize, Clone, Debug)]
pub struct UsuarioDto {
    pub id: i64,
    pub nombre: String,
    pub salario_personal_objetivo_centavos: i64,
    pub modo_mejorado_activo: bool,
}
```

### 2) `src/data/__tests__/tauri-commands.test.ts` (3 tests nuevos)

| Test | Wrapper | Shape del payload IPC esperado |
|------|---------|-------------------------------|
| `obtenerPerfiles invokes cmd_obtener_perfiles` | `obtenerPerfiles()` | `invoke('cmd_obtener_perfiles')` (sin payload) |
| `crearPerfil invokes cmd_crear_perfil with input` | `crearPerfil({nombre, salario})` | `invoke('cmd_crear_perfil', { input: {nombre, salario} })` (envuelto bajo `input`, igual que `insertarTransaccion`) |
| `obtenerPerfil invokes cmd_obtener_perfil with id` | `obtenerPerfil(id)` | `invoke('cmd_obtener_perfil', { id })` (top-level, igual que `eliminarTransaccion`) |

Tipos a anadir a `tauri-commands.ts`:
```typescript
export interface UsuarioDto { id: number; nombre: string; salario_personal_objetivo_centavos: number; modo_mejorado_activo: boolean }
export interface CrearPerfilInput { nombre: string; salario_personal_objetivo_centavos: number }
```

### 3) `src/data/__tests__/perfil-activo.test.ts` (4 tests)

Helper de persistencia del perfil activo en `localStorage`:

| Test | Comportamiento esperado |
|------|------------------------|
| `obtenerPerfilActivo returns null when no profile is saved` | Sin storage => `null` |
| `guardarPerfilActivo + obtenerPerfilActivo roundtrips` | `guardarPerfilActivo(42)` + `obtenerPerfilActivo()` => `42` |
| `limpiarPerfilActivo removes the saved profile` | Tras limpiar => `null` |
| `obtenerPerfilActivo returns null when localStorage has invalid JSON` | Storage corrupto => `null` (no throw) |

API a exportar desde `src/data/perfil-activo.ts`:
```typescript
export function obtenerPerfilActivo(): number | null
export function guardarPerfilActivo(id: number): void
export function limpiarPerfilActivo(): void
```
Storage key: `'mvp-fin:perfil-activo'`.

### 4) `src/components/organisms/__tests__/SelectorPerfil.test.tsx` (5 tests)

Organism (Atomic Design) que renderiza el selector al abrir:

| Test | Contrato |
|------|----------|
| `renders a full-screen overlay when shown` | `data-testid="selector-perfil"` presente en el DOM |
| `renders one option per profile` | N elementos `[data-testid="opcion-perfil"]` por cada perfil |
| `calls onSeleccionar with the right id when an option is clicked` | Click en opcion[1] -> `onSeleccionar(2)` |
| `shows loading state when cargando=true` | `data-testid="selector-perfil-cargando"` presente |
| `shows create-new button` | `data-testid="boton-crear-perfil"` siempre presente |

Props esperados:
```typescript
interface SelectorPerfilProps {
  perfiles: UsuarioDto[]
  onSeleccionar: (id: number) => void
  cargando: boolean
}
```

## Estado RED verificado

```
$ cargo test --no-run
error[E0432]: unresolved imports `cmd_crear_perfil_impl`,
              `cmd_obtener_perfil_impl`, `cmd_obtener_perfiles_impl`,
              `UsuarioDto`
   --> tests\commands_test.rs:60:5

$ pnpm test
Test Files  3 failed | 15 passed (18)
     Tests  3 failed | 90 passed (93)
```

- Tests Rust: **fallan al compilar** (1 error, 4 imports sin resolver).
- Tests TS perfil-activo: **falla el archivo entero** (modulo no existe).
- Tests TS SelectorPerfil: **falla el archivo entero** (componente no existe).
- Tests TS tauri-commands: **3 tests nuevos fallan** (wrappers no exportados); los 6 tests previos de slice 7 y el test de slice 8 siguen pasando (regresion cero).

> Si la IMPL introduce los 3 modulos y las firmas correctas, los 13 tests nuevos + los 3 tests previos continuaran pasando (90 + 16 esperados = 106 total).

## Trabajo NO incluido en la fase RED

Esta fase NO crea ningun archivo de implementacion. Queda pendiente para la fase IMPL:

- `src-tauri/src/commands.rs` — agregar `UsuarioDto` + 3 `cmd_*_perfil*_impl` + 3 wrappers `#[tauri::command]`.
- `src-tauri/src/lib.rs` — registrar los 3 nuevos commands en `tauri::generate_handler!`.
- `src/data/tauri-commands.ts` — agregar tipos `UsuarioDto` + `CrearPerfilInput` y 3 wrappers.
- `src/data/perfil-activo.ts` — implementar el helper de localStorage.
- `src/components/organisms/SelectorPerfil.tsx` — implementar el organism.
- `src/App.tsx` — integrar el selector y pasar `usuario_id` a `insertarTransaccion` / `listarTransacciones`.

> Esta es la fase RED. La fase IMPL se delega en un agente separado.
