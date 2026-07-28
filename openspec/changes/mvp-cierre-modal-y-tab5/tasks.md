# Tareas: Cierre MVP — Modal Salario Objetivo + 5ª Tab Presupuesto Mejorado

> Blueprint ejecutable para la fase `sdd-apply`. Cada tarea es atómica y tiene DoD verificable.
> Trazabilidad: proposal.md (§1-§7), spec.md (20 escenarios), design.md (11 archivos, 27 tests).

---

## A. Resumen de planificación

| Métrica                      | Valor               |
| ---------------------------- | ------------------- |
| Total de tareas              | 14                  |
| Diff total estimado (líneas) | 400-600             |
| PRs recomendados             | 2 slices (A + B)    |
| Estrategia de chained PRs    | **stacked-to-main** |

### Recomendación de estrategia

Se recomienda **`stacked-to-main`** porque:

- Cada slice entrega una demo verificable de extremo a extremo
- Slice A (modal salario) es independiente de Slice B (5ª tab)
- Ambos slices pueden targetear `main` directamente
- Si un slice falla, el otro puede continuar sin bloqueos

**Slice A**: D1 Modal salario objetivo (~300-350 líneas)
**Slice B**: D2 5ª tab Presupuesto Mejorado (~150-250 líneas)

---

## B. Revisión de carga de trabajo (Review Workload Forecast)

| Field | Value |
|-------|-------|
| Estimated changed lines | 400-600 |
| 400-line budget risk | Medium / High |
| Chained PRs recommended | Yes |
| Suggested split | Slice A → Slice B |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Slice A — D1 Modal salario objetivo | PR 1 | Rust cmd + wrapper TS + ModalSalarioObjetivo + integración en EstadoResultadosPanel + 3 archivos de test |
| 2 | Slice B — D2 5ª tab Presupuesto Mejorado | PR 2 | PresupuestoMejoradoPanel + integración en App.tsx + 1 archivo de test |

---

## C. Tareas por slice

### SLICE A — D1 Modal Salario Objetivo (HU-502)

**Trazabilidad**: REQ-502-D1-1 a REQ-502-D1-11 (11 escenarios)

| ID    | Tipo | REQs                              | Título                                              | Descripción                                                                 | Archivos                                             | Dependencias | DoD                                              |
| ----- | ---- | --------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------- | ------------ | ------------------------------------------------ |
| T-501 | RED | REQ-502-D1-2 a D1-9              | Tests para `ModalSalarioObjetivo`                   | Crear `ModalSalarioObjetivo.test.tsx` con 8 escenarios: open con pre-load, click Guardar invoca onGuardar, input vacío disabled, negativo rechazado, >$1B rechazado, cancelar, backdrop cierra, perfilActivoId change cierra, onGuardar rejection muestra error | `src/components/organisms/__tests__/ModalSalarioObjetivo.test.tsx` | —            | `pnpm test` falla al importar (RED confirmado) |
| T-502 | GREEN | — | Implementar `ModalSalarioObjetivo` organism | Crear `ModalSalarioObjetivo.tsx` con estado local (inputTexto, errorValidacion, errorIpc, guardando), useEffect para pre-load, useEffect para cerrar al cambiar perfil, validación sync con parsePesosInput, validación >1e11 | `src/components/organisms/ModalSalarioObjetivo.tsx` | T-501        | Pasa todos los tests de T-501 |
| T-503 | RED | REQ-502-D1-1, D1-11              | Tests para botón "Editar salario" en panel         | Modificar `EstadoResultadosPanel.test.tsx`: botón visible cuando salarioObjetivoCentavos !== null Y perfilActivoId !== null; botón NO visible cuando null | `src/components/organisms/__tests__/EstadoResultadosPanel.test.tsx` | —            | `pnpm test` falla en el nuevo branch (RED) |
| T-504 | GREEN | — | Modificar `EstadoResultadosPanel` para modal    | Agregar state `modalAbierto: boolean`, agregar props `perfilActivoId` y `onSalarioGuardado`, renderizar botón "Editar salario" cuando corresponde, renderizar ModalSalarioObjetivo cuando modalAbierto | `src/components/organisms/EstadoResultadosPanel.tsx` | T-503        | Pasa tests de T-503 |
| T-505 | RED | REQ-502-D1-3 (wrapper)           | Test para wrapper `actualizarSalarioObjetivo`      | Agregar test en `tauri-commands.test.ts` que verifique invoke con el shape correcto: `{ input: { perfil_id, salario_objetivo_centavos } }` | `src/data/__tests__/tauri-commands.test.ts` | —            | `pnpm test` falla en test nuevo (RED) |
| T-506 | GREEN | — | Agregar wrapper TS `actualizarSalarioObjetivo` | Agregar función en `src/data/tauri-commands.ts` que invoca `cmd_update_salario_objetivo` con el payload envuelto | `src/data/tauri-commands.ts` | T-505        | Pasa test de T-505 |
| T-507 | RED | REQ-502-D1-3 (Rust)              | Tests para `cmd_update_salario_objetivo` (Rust)   | Crear `usuarios_update_test.rs` con 4 tests: update exitoso, negativo rechazado, > 100B rechazado, perfil inexistente rechazado | `src-tauri/tests/usuarios_update_test.rs` | —            | `cargo test` falla (RED confirmado) |
| T-508 | GREEN | — | Implementar comando Rust + registro              | Agregar `cmd_update_salario_objetivo` + `UpdateSalarioObjetivoInput` + `_impl` en `commands.rs`, registrar en `lib.rs` invoke_handler | `src-tauri/src/commands.rs`, `src-tauri/src/lib.rs` | T-507        | Pasa todos los tests de T-507 |
| T-509 | VERIFY | — | Verificación integral Slice A                   | Ejecutar `pnpm test` + `cargo test`, verificar 206 tests previos + nuevos pasan, commit con conventional-commits | Todos los archivos de Slice A | T-508        | Todos los tests verdes |

---

### SLICE B — D2 5ª Tab Presupuesto Mejorado (HU-403 continuación)

**Trazabilidad**: REQ-403-D2-1 a REQ-403-D2-8, REQ-605-D2-1 (9 escenarios)

| ID    | Tipo | REQs                              | Título                                              | Descripción                                                                 | Archivos                                             | Dependencias | DoD                                              |
| ----- | ---- | --------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------- | ------------ | ------------------------------------------------ |
| T-510 | RED | REQ-403-D2-1 a D2-5, D2-7, D2-8, REQ-605-D2-1 | Tests para `PresupuestoMejoradoPanel` | Crear `PresupuestoMejoradoPanel.test.tsx` con 9 escenarios: render con datos, banner cuando simulaciones vacías, empty state cuando sin transacciones, KPI golden $6,275,000.00, simulaciones huérfanas ignoradas, test-id en nav | `src/components/organisms/__tests__/PresupuestoMejoradoPanel.test.tsx` | —            | `pnpm test` falla al importar (RED confirmado) |
| T-511 | GREEN | — | Implementar `PresupuestoMejoradoPanel` organism | Crear organism que usa `useMemo` con `calcularMatrizMejorada` (reúso, no recalcular), renderiza matriz + KPIs derivados, banner si simulaciones vacías, empty state si sin transacciones | `src/components/organisms/PresupuestoMejoradoPanel.tsx` | T-510        | Pasa todos los tests de T-510 |
| T-512 | RED | REQ-403-D2-8                     | Tests para integración App.tsx (5ª tab)             | Agregar test que verifique: type TabActiva acepta 'presupuesto-mejorado', render condicional del panel, test-id presente en nav | `src/components/organisms/__tests__/PresupuestoMejoradoPanel.test.tsx` | —            | Test falla si App.tsx no tiene la tab |
| T-513 | GREEN | — | Modificar App.tsx para 5ª tab                     | Extender type TabActiva, agregar botón en nav con data-testid="tab-presupuesto-mejorado", agregar render condicional para PresupuestoMejoradoPanel, pasar props (transacciones, categorias, simulaciones, onIrATransacciones) | `src/App.tsx` | T-512        | Pasa test de T-512 |
| T-514 | VERIFY | — | Verificación integral Slice B                   | Ejecutar `pnpm test` + `cargo test`, verificar 206 + Slice A tests pasan + nuevos de Slice B, commit | Todos los archivos de Slice B | T-513        | Todos los tests verdes |

---

## D. Orden de ejecución y dependencias

### Grafo de dependencias (textual)

```
T-501 ─► T-502 ─► T-504 ─► T-506 ─► T-508 ─► T-509
  │                          │              │
  └► T-503 ─► T-504 ◄───────┘              │
       │                                    │
       └► T-505 ─► T-506 ──────────────────┘
                          │
       ┌──────────────────┘
       │
T-507 ─► T-508 ◄───────────────────────────► T-509

Slice A completo (T-501..T-509) ──────────────────────────────┐
                                                            │
       ┌──────────────────────────────────────────────────────┘
       │
T-510 ─► T-511 ─► T-513 ─► T-514
  │           │
  └► T-512 ───┘

Slice B completo (T-510..T-514)
```

### Definición de slices (PRs)

| Slice | PR # | Tareas                    | Demo verificable                                                      |
| ----- | ---- | ------------------------- | --------------------------------------------------------------------- |
| **A** | PR #1 | T-501 → T-509             | Modal salario abre, persiste valor, panel rehidrata sin recarga       |
| **B** | PR #2 | T-510 → T-514            | 5ª tab renderiza matriz mejorada con KPIs golden $6,275,000.00       |

---

## E. Riesgos de implementación

| Riesgo                                                              | Probabilidad | Impacto | Mitigación                                                                                                                               |
| ------------------------------------------------------------------- | ------------ | ------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| El wrapper `actualizarSalarioObjetivo` debe usar snake_case en el payload | Alta         | Medio   | Design §8 R-1 pineó el shape `{ input: { perfil_id, salario_objetivo_centavos } }`. Test RED verifica el contract.                        |
| El test del organism necesita mockear `@tauri-apps/api/core`         | Media        | Bajo    | Modal NO llama IPC directo, solo el callback onGuardar. Test del modal valida callback; test de integración del padre mockea si es necesario. |
| `calcularMatrizMejorada` requiere tipos compatibles                 | Baja         | Medio   | El organism castea `transacciones as never` igual que App.tsx línea 165. Patrón verificado en el codebase.                                 |
| El diff total excede 400 líneas                                     | Alta         | Medio   | chained PRs aplicado: Slice A (~350 líneas) + Slice B (~250 líneas) = ~600 líneas total, pero cada PR < 400.                              |
| TDD strict: tests RED antes de GREEN                                | Alta         | Alto    | Cada tarea tiene su propia fase RED (T-501, T-503, T-505, T-507, T-510, T-512). Verificar con `pnpm test` / `cargo test` antes de GREEN. |

---

## F. Definition of Done

### DoD por tarea (específica)

- Código compilable (build pasa)
- Tests unitarios asociados pasan (RED → GREEN)
- Prueba de integración manual completada por el usuario
- Conventional commit con scope en español

### DoD global del change

- [ ] Slice A mergeado a main con `cmd_update_salario_objetivo` + `ModalSalarioObjetivo` + integración en `EstadoResultadosPanel`
- [ ] Slice B mergeado a main con `PresupuestoMejoradoPanel` + 5ª tab en `App.tsx`
- [ ] Tests verdes: `pnpm test` y `cargo test` corren **sin regresiones** (mínimo 206 tests previos + 27 nuevos = 233)
- [ ] `MVP-COMPLETE.md` actualizado:
  - HU-502: ✅ Done
  - HU-403 con tab separada: ✅ Done
  - Épica 5: ✅ Done
  - Épica 4: ✅ Done
- [ ] Ambos cambios (`mvp-financiero-local-first` y `mvp-cierre-modal-y-tab5`) archivados formalmente

---

## G. Escenarios de prueba por REQ

### D1 — Modal Salario Objetivo (11 escenarios)

| REQ | Escenario |
|-----|-----------|
| REQ-502-D1-1 | Botón visible con perfil activo y salario configurado |
| REQ-502-D1-2 | Modal abre con valor pre-cargado |
| REQ-502-D1-3 | Guardado con valor válido |
| REQ-502-D1-4 | Input vacío deshabilita guardar |
| REQ-502-D1-5 | Valor negativo rechazado |
| REQ-502-D1-6 | Valor > $1B rechazado |
| REQ-502-D1-7 | Cancelar cierra sin persistir |
| REQ-502-D1-8 | Cambio de perfil cierra modal |
| REQ-502-D1-9 | Error de IPC muestra mensaje |
| REQ-502-D1-10 | State se actualiza en memoria |
| REQ-502-D1-11 | Sin perfil activo no renderiza botón |

### D2 — 5ª Tab Presupuesto Mejorado (8 escenarios + 1 golden)

| REQ | Escenario |
|-----|-----------|
| REQ-403-D2-1 | Navegación a la 5ª tab |
| REQ-403-D2-2 | Renderizado de matriz mejorada |
| REQ-403-D2-3 | Banner cuando no hay simulaciones |
| REQ-403-D2-4 | Empty state sin transacciones |
| REQ-403-D2-5 | KPI Total Gastos Mejorado con golden value |
| REQ-403-D2-6 | Sin perfil activo redirige al selector |
| REQ-403-D2-7 | Simulaciones huérfanas ignoradas |
| REQ-403-D2-8 | Test id en el nav de tabs |
| REQ-605-D2-1 | KPI cierra al centavo contra golden |

---

## H. Convenciones de commits por slice

### Slice A — D1 Modal Salario Objetivo

```text
test(ModalSalarioObjetivo): add failing tests for REQ-502-D1-* (RED)
feat(ui): implement ModalSalarioObjetivo organism
test(EstadoResultadosPanel): add failing tests for edit button (RED)
feat(ui): add "Editar salario" button + modal state to EstadoResultadosPanel
test(tauri-commands): add failing test for actualizarSalarioObjetivo wrapper (RED)
feat(data): add actualizarSalarioObjetivo wrapper
test(rust): add failing tests for cmd_update_salario_objetivo (RED)
feat(tauri): implement cmd_update_salario_objetivo command
test: verify Slice A integration
```

### Slice B — D2 5ª Tab Presupuesto Mejorado

```text
test(PresupuestoMejoradoPanel): add failing tests for REQ-403-D2-* (RED)
feat(ui): implement PresupuestoMejoradoPanel organism
test(App): add failing test for 5th tab integration (RED)
feat(ui): add 5th tab "Presupuesto Mejorado" to App.tsx
test: verify Slice B integration
```

---

## I. Referencias

- Propuesta: `openspec/changes/mvp-cierre-modal-y-tab5/proposal.md`
- Spec: `openspec/changes/mvp-cierre-modal-y-tab5/spec.md` (20 escenarios)
- Design: `openspec/changes/mvp-cierre-modal-y-tab5/design.md` (11 archivos, 27 tests)
- Baseline tareas: `openspec/changes/mvp-financiero-local-first/tasks.md`
- Patrón de tests: `src/components/organisms/__tests__/EstadoResultadosPanel.test.tsx`
- Patrón wrapper: `src/data/__tests__/tauri-commands.test.ts`
- Command Rust existente: `src-tauri/src/commands.rs` (líneas 200-346)
- Registro invoke: `src-tauri/src/lib.rs` (líneas 24-35)
- Helper parsing: `src/domain/precision/money.ts` (parsePesosInput, formatCentavos)
- Matriz mejorada: `src/domain/simulador/matriz-mejorada.ts` (golden 6,275,000.00)
- Estado actual App.tsx: línea 149 (TabActiva), línea 152 (salarioObjetivoCentavos), línea 156 (simulaciones)

---

## J. Notas adicionales

1. **Idioma**: Todos los textos de UI, mensajes de commit y documentación en **español neutro**.
2. **TDD strict**: cada tarea tiene fase RED (test que falla) → GREEN (implementación que pasa) → REFACTOR (si aplica).
3. **Sin dependencias nuevas**: No se instala `@testing-library/react`, se usa el patrón `react-dom/client` + `createRoot` + `act()` existente.
4. **Reusar no recalcular**: `PresupuestoMejoradoPanel` usa `calcularMatrizMejorada` via `useMemo`; no duplica lógica.
5. **Validación en dos capas**: el modal valida antes de invocar IPC; el backend también valida (defensa en profundidad).

---

_Blueprint listo para `sdd-apply`._
