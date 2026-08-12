# Tasks: MVP v2 Features

## Review Workload Forecast

| Campo | Valor |
|---|---|
| Líneas estimadas | 650-900 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Split sugerido | PR 1 edición → PR 2 perfiles → PR 3 modo/docs |
| Delivery strategy | ask-on-risk |
| Chain strategy | feature-branch-chain |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Work units sugeridos

| Unidad | Objetivo | Test enfocado | Harness runtime | Rollback |
|---|---|---|---|---|
| 1 | Editar transacciones | `npm test -- TransaccionForm ListaTransacciones tauri-commands && cargo test commands_test --manifest-path src-tauri/Cargo.toml` | `npm run tauri dev`: editar fila y ver totales | `commands.rs`, `repo.rs`, `tauri-commands.ts`, form/lista |
| 2 | Gestión/aislamiento de perfiles | `npm test -- SelectorPerfil App && cargo test commands_test --manifest-path src-tauri/Cargo.toml` | crear, seleccionar, renombrar y cancelar borrado | comandos/wrappers/perfil/App |
| 3 | Modo mejorado y cierre SDD | `npm test -- App EstadoResultadosPanel && npm run build` | alternar modo con/sin simulación | toggle/App/docs/OpenSpec |

## Ya implementado/documentado

- [x] A.1 REQ-V2-104: sanitización numérica y layout estable en commits 1-3; conservar regresiones.
- [x] A.2 REQ-V2-105: `EstadoResultadosPanel` 1:1 con Excel en commit 4; conservar pruebas.

## Phase 1: Edición de transacciones

- [x] 1.1 RED: en `src-tauri/tests/commands_test.rs`, probar update exitoso sin duplicar, rechazo de `id` ajeno e `usuario_id` preservado.
- [x] 1.2 GREEN: agregar `cmd_update_transaccion_impl`, wrapper Tauri y registro en `src-tauri/src/commands.rs`, `repo.rs`, `lib.rs`.
- [x] 1.3 RED: en `src/data/__tests__/tauri-commands.test.ts`, exigir `cmd_update_transaccion` con `{ id, input }`.
- [x] 1.4 GREEN: exportar `actualizarTransaccion` desde `src/data/tauri-commands.ts`.
- [x] 1.5 RED: probar `ListaTransacciones`/`TransaccionForm` para editar, precargar, cancelar y validar datos inválidos.
- [x] 1.6 GREEN: cablear edición en `src/App.tsx`, `ListaTransacciones.tsx` y `TransaccionForm.tsx` con refetch.

## Phase 2: Perfiles

- [x] 2.1 RED: backend para renombrar, eliminar con protección y filtrar mutations/listados por perfil activo.
- [x] 2.2 GREEN: implementar comandos de perfil e impedir cruces de `usuario_id` en `commands.rs`/repos.
- [x] 2.3 RED: wrappers TS y `SelectorPerfil` para crear, seleccionar, renombrar y cancelar eliminación.
- [ ] 2.4 GREEN: actualizar `src/data/tauri-commands.ts`, `SelectorPerfil.tsx` y `App.tsx` usando `localStorage` como perfil activo.


## Phase 3: Modo mejorado

- [ ] 3.1 RED: integración en `App` para activar modo, mantener base recuperable y avisar si no hay simulación.
- [ ] 3.2 GREEN: agregar toggle visible y alimentar matriz/resultados con base o mejorado sin nuevas dependencias.

## Phase 4: Cierre SDD y verificación

- [ ] 4.1 Consolidar fuente SDD: conservar `specs/mvp-v2-features/spec.md`; eliminar o convertir `openspec/changes/mvp-v2-features/spec.md` en puntero.
- [ ] 4.2 Confirmar espejo Engram en `app-diagnostico-financiero-local`, no en `antigravity`, y revisar `MVP-COMPLETE.md`/`README.md` solo si quedan obsoletos.
- [ ] 4.3 Ejecutar DoD: `npm test`, `npm run build`, `cargo test --manifest-path src-tauri/Cargo.toml`; no reclamar verify/archive hasta completar apply.

## DoD

- [ ] Cada pendiente tuvo RED antes de GREEN, sin `@testing-library/react` ni deps nuevas injustificadas.
- [ ] IPC solo vía `src/data/tauri-commands.ts`; organismos cableados en `src/App.tsx`.
- [ ] Tasks se marcan `[x]` durante apply y el usuario hace commits manualmente.
