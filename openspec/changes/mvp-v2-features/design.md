# Diseño: MVP v2 Features

## Enfoque técnico

Este cambio continúa sobre la arquitectura actual: React sin `pages/` ni React Router, con organismos cableados en `src/App.tsx`, dominio puro en `src/domain/`, wrappers IPC únicos en `src/data/tauri-commands.ts` y comandos Rust testeables como `cmd_*_impl(&Connection)` antes del wrapper `#[tauri::command]`. El diseño separa correcciones ya implementadas de trabajo pendiente y conserva TDD estricto: cada pendiente debe iniciar con RED test.

## Estado del alcance

| Requisito | Estado | Diseño |
|---|---:|---|
| REQ-V2-101 Edición de transacciones | Pendiente | Agregar `cmd_update_transaccion`, wrapper TS y flujo de edición en UI. |
| REQ-V2-102 Gestión de perfiles | Parcial/Pendiente | Ya existen listar/crear/obtener; faltan renombrar, eliminar protegido y aislamiento activo real. |
| REQ-V2-103 Modo Mejorado | Pendiente | Toggle visible que decide si se renderiza matriz/resultados base o mejorados. |
| REQ-V2-104 Calidad input/layout | Implementado commits 1-3 | Mantener tests de regresión; no rediseñar. |
| REQ-V2-105 Estado Resultados 1:1 | Implementado commit 4 | Mantener golden/tests; no reclamar verificación SDD final. |

## Decisiones de arquitectura

| Decisión | Alternativa | Rationale |
|---|---|---|
| Actualizar transacciones por comando IPC dedicado `cmd_update_transaccion` | Reusar delete+insert | Evita duplicados, conserva `id`, `usuario_id`, `created_at` y simulaciones asociadas. |
| UI de edición controlada desde `App.tsx` con `TransaccionForm` en modo edición | Crear página/ruta nueva | La app no usa router; `App.tsx` ya coordina submit/refetch/estado. |
| Wrappers obligatorios en `src/data/tauri-commands.ts` | Invocar Tauri desde componentes | Mantiene el contrato existente y permite testear payloads sin runtime Tauri. |
| Perfiles como extensión del selector actual | Nuevo módulo global de sesión | Minimiza alcance; pero debe corregir el riesgo actual: list/insert aún resuelven “Yo”/primer usuario en backend. |
| Toggle de Modo Mejorado en estado React local, persistiendo `Usuarios.modo_mejorado_activo` solo si se cablea comando dedicado | Reemplazar la tab Presupuesto Mejorado | Permite alternar sin perder base y sin romper la tab existente. |

## Flujo de datos

```text
ListaTransacciones ──Editar──> App.tsx estado edición
App.tsx ──props iniciales──> TransaccionForm
TransaccionForm ──payload válido──> actualizarTransaccion()
tauri-commands.ts ──cmd_update_transaccion──> commands.rs ──repo::update──> SQLite
App.tsx ──refetch──> listarTransacciones/obtenerSimulaciones ──> matriz/resultados
```

Para perfiles:
```text
SelectorPerfil/App.tsx ──wrappers──> cmd_crear/renombrar/eliminar/obtener_perfiles
localStorage perfilActivo ──debe alimentar──> consultas/mutations por usuario_id
```

## Impacto por archivo

| Archivo | Acción | Descripción |
|---|---|---|
| `src-tauri/src/transacciones/repo.rs` | Modificar | Usar/ajustar `update` para preservar `usuario_id`; fallar si `id` inexistente o ajeno al perfil activo. |
| `src-tauri/src/commands.rs` | Modificar | Agregar `cmd_update_transaccion_impl` y wrapper; agregar renombrar/eliminar perfil si REQ-V2-102 avanza. |
| `src-tauri/src/lib.rs` | Modificar | Registrar nuevos comandos en `generate_handler!`. |
| `src/data/tauri-commands.ts` | Modificar | Exportar `actualizarTransaccion(input)` y wrappers de perfiles pendientes. |
| `src/App.tsx` | Modificar | Estado `transaccionEditando`, guardar edición, cancelar, refetch y toggle modo mejorado. |
| `src/components/molecules/TransaccionForm.tsx` | Modificar | Soportar `initialValue`, etiqueta “Guardar cambios” y validación compartida. |
| `src/components/organisms/ListaTransacciones.tsx` | Modificar | Botón `Editar` por fila y callback `onEditar`. |
| `src/components/organisms/SelectorPerfil.tsx` | Modificar | Crear/renombrar/eliminar con confirmación explícita. |
| `src/components/organisms/__tests__/*` y `src/data/__tests__/tauri-commands.test.ts` | Modificar/Crear | RED tests previos a implementación. |
| `src-tauri/tests/commands_test.rs` | Modificar | RED tests backend para update/perfiles. |

## Contratos

```ts
export async function actualizarTransaccion(id: number, input: TransaccionInputDto): Promise<TransaccionCompletaDto>
// invoke('cmd_update_transaccion', { id, input })
```

`cmd_update_transaccion_impl(conn, id, usuario_id, input)` debe devolver la fila actualizada o `Err` si no existe/no pertenece al perfil activo.

## Estrategia de pruebas TDD

| Capa | RED antes de implementar |
|---|---|
| Backend Rust | `cmd_update_transaccion_impl` actualiza sin duplicar, rechaza id ajeno, conserva `usuario_id`; perfil rename/delete protegido. |
| Wrapper TS | `actualizarTransaccion` invoca `cmd_update_transaccion` con `{ id, input }`; wrappers de perfil respetan payload. |
| React unit | `ListaTransacciones` llama `onEditar(id)`; `TransaccionForm` precarga/cancela/guarda cambios; selector confirma eliminación. |
| Integración App | Editar refresca lista/totales; cambiar perfil no filtra datos ajenos; toggle cambia base/mejorado y muestra aviso sin simulación. |
| Regresión | Mantener suites de sanitización/layout y `EstadoResultadosPanel` 1:1. |

## Threat Matrix

N/A — no hay cambio de routing, shell, subprocess, automatización VCS/PR, clasificación de ejecutables ni integración de procesos. La frontera relevante es IPC Tauri/SQLite y queda cubierta por contratos y RED tests.

## Migración / rollout

No se requiere migración nueva si se reutilizan columnas existentes (`Usuarios.modo_mejorado_activo`). El rollout debe hacerse en slices pequeños: edición de transacciones, perfiles, toggle, regresiones.

## Riesgos

- El backend aún resuelve transacciones contra “Yo”/primer usuario; REQ-V2-102 requiere aislar por perfil activo real.
- `repo::update` actual no filtra por `usuario_id`; debe endurecerse antes de exponer edición.
- No reclamar verify/archive: faltan tareas, implementación pendiente y verificación formal.

## Preguntas abiertas

- [ ] ¿El modo mejorado debe persistirse por perfil inmediatamente o basta estado local en esta iteración?
