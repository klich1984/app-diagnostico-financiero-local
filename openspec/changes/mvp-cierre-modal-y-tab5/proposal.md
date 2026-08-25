# Propuesta: Cierre del MVP — Modal salario objetivo + 5ª tab Presupuesto Mejorado

> **Trazabilidad**: las decisiones bloqueadas y el baseline arquitectónico viven en `openspec/changes/mvp-financiero-local-first/proposal.md`. Este cambio **no renegocia** ese baseline; lo extiende con 2 deliverables cortos para cerrar el snapshot de `MVP-COMPLETE.md` y dejar el cambio `mvp-financiero-local-first` en condiciones de archivarse formalmente.

## 1. Resumen ejecutivo

El cambio `mvp-financiero-local-first` está implementado al 95% (206 tests verde, 14 slices mergeadas, 19/19 REQs, 14/14 HUs con lógica, 13/14 con UI). El snapshot `MVP-COMPLETE.md` del 2026-07-24 documenta dos pendientes objetivos que impiden el cierre formal del cambio: **HU-502 sin modal UI** para editar el `salario_personal_objetivo` desde la app (la columna ya existe en la tabla `Usuarios` y el motor de KPIs ya la descuenta correctamente del lado "Mejorado"), y **la 5ª tab del PRD ("Presupuesto Mejorado") consolidada dentro de la tab Simulador** en lugar de vivir como tab separada tal como pedía el PRD original.

Este change resuelve ambos pendientes con dos deliverables acotados: **D1** agrega un modal de edición disparado desde `EstadoResultadosPanel` que escribe a la DB vía un nuevo Tauri command `cmd_update_salario_objetivo(perfil_id, centavos)`, y **D2** agrega una 5ª tab "Presupuesto Mejorado" que renderiza un nuevo organism `PresupuestoMejoradoPanel` reusando `calcularMatrizMejorada` (golden `6,275,000.00`) sin recalcular ni duplicar la lógica de matriz. El alcance es deliberadamente chico: solo lo necesario para destrabar el archivado del cambio anterior, sin meter épica nueva.

## 2. Alcance

### Dentro del alcance

- **D1**. Modal UI para editar `salario_personal_objetivo_centavos` del perfil activo, disparado desde `EstadoResultadosPanel`.
- **D2**. 5ª tab "Presupuesto Mejorado" en el nav de `App.tsx`, con un nuevo organism que renderiza la matriz mejorada y sus KPIs derivados.
- Pruebas TDD (RED primero) en frontend (Vitest) y backend (`cargo test`).
- Actualización de `MVP-COMPLETE.md` marcando los dos pendientes como resueltos.

### Fuera del alcance

- Multi-currency, cloud sync, dark mode, exportación a Excel/PDF/CSV, Open Finance, notificaciones push, scroll virtualizado, WCAG AA, mod de creación de perfil nuevo (esto último ya está en el slice 14).
- Modificaciones a la lógica del motor de KPIs (`src/domain/kpis/index.ts`, `src-tauri/src/kpis.rs`).
- Re-implementación de la matriz mejorada: D2 **reusa** `calcularMatrizMejorada` tal cual existe.
- Nueva columna, tabla o migración: la columna `salario_personal_objetivo_centavos` ya está en `Usuarios` desde `001_inicial.sql`.

## 3. Decisiones bloqueadas

Estas 7 decisiones son **inmutables** para las fases de especificación, diseño, tareas e implementación de este change. Cualquier reversión requiere reabrir la conversación con el orquestador.

| #   | Decisión                                     | Detalle                                                                                                                                                                                                                                                                                                                                                           |
| --- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Idioma de la UI**                          | Español neutro LATAM sin voseo. Textos formales con "tú", sin modismos regionales. Sin selector de locale en v1. (Replicada de `mvp-financiero-local-first` §3 #1.)                                                                                                                                                                                               |
| 2   | **Salario Personal Objetivo en FA2 inicial** | NO se descuenta al inicio. El modal NO cambia la lógica existente: solo persiste el valor; el motor ya lo aplica solo del lado "Mejorado". (Replicada de §3 #2.)                                                                                                                                                                                                  |
| 3   | **Librería de gráficos**                     | Recharts. No se introduce otra. D2 no usa gráficos nuevos (queda fuera de scope). (Replicada de §3 #3.)                                                                                                                                                                                                                                                           |
| 4   | **Validación de enums**                      | CHECK constraints SQL (sin cambios). La columna `salario_personal_objetivo_centavos` ya tiene `CHECK (>= 0)` en la migración inicial. (Replicada de §3 #4.)                                                                                                                                                                                                       |
| 5   | **Límite duro de transacciones**             | Sin límite duro. El modal no introduce un contador. (Replicada de §3 #5.)                                                                                                                                                                                                                                                                                         |
| 6   | **Soporte multi-usuario**                    | Múltiples perfiles. El modal de salario objetivo toma el `perfil_id` del perfil activo (el que ya está en `localStorage` y se hidrata en `App.tsx`). La edición desde `SelectorPerfil` queda como no-goal. (Replicada de §3 #6 con la salvedad del modal.)                                                                                                        |
| 7   | **Ubicación del trigger del modal**          | **NUEVA**. El botón "Editar salario" se monta en `EstadoResultadosPanel` (junto al subtítulo `formatCentavos(salarioObjetivoCentavos)` en línea 42-46), NO en `SelectorPerfil`. Razón: ese panel es donde el usuario ve el valor cuando revisa su estado; el selector es DUMB y de primer-arranque. La edición desde el chip "Cambiar perfil" queda como no-goal. |

## 4. Deliverable D1 — Modal salario objetivo (HU-502 / REQ-502 continuación)

**Trazabilidad**: HU-502 → REQ-502 (continuación) → Tarea T-502 (nueva).

### Criterio de aceptación

- En la tab "Resultados", junto al subtítulo `Salario personal objetivo: $X.XXX.XXX` que ya existe (`EstadoResultadosPanel.tsx:42-46`), aparece un botón **"Editar salario"** visible SOLO cuando `salarioObjetivoCentavos !== null` (es decir, hay perfil activo).
- Al hacer click se abre un modal full-screen overlay (mismo patrón CSS que `SelectorPerfil.tsx`: `fixed inset-0 z-50`) con:
  - Título: **"Editar salario personal objetivo"**.
  - Subtítulo/help: **"Este valor se descuenta del Flujo de Ahorro 2 en el Estado de Resultados Mejorado."** (referencia a decisión bloqueada #2).
  - Input numérico que acepta formato `1.500.000` (separadores `.` como miles, coma como decimal — replicar contrato de `parsePesosInput` en `src/domain/precision/money.ts:141`).
  - Valor inicial pre-cargado con el `salarioObjetivoCentavos` actual, formateado con `formatCentavos`.
  - Botones **"Guardar"** (primary) y **"Cancelar"** (secondary).
- Al hacer click en "Guardar" con input válido, se invoca `cmd_update_salario_objetivo(perfil_id, centavos)` (ver §6 arquitectura), se cierra el modal, y el panel se rehidrata con el nuevo valor (refetch del perfil activo + actualización del state `salarioObjetivoCentavos` en `App.tsx`).
- Al hacer click en "Cancelar" o en el backdrop, se cierra el modal sin persistir.

### Edge cases

| Caso                                            | Comportamiento esperado                                                                                                                      |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Input vacío                                     | Botón "Guardar" deshabilitado. Mensaje inline: "Ingresa un valor".                                                                           |
| Valor `0`                                       | Aceptado (válido: usuario decide no descontar nada). Persiste `0`.                                                                           |
| Valor negativo (`-500.000`)                     | Rechazado en el parser (`parsePesosInput` retorna `null` para `< 0`). Mostrar mensaje "El valor no puede ser negativo".                      |
| Valor > `$1.000.000.000` (1 billón)             | Rechazado: el modal valida `centavos <= 100_000_000_000` antes de invocar el command. Mostrar mensaje "El valor excede el máximo permitido". |
| Cambio de perfil mientras el modal está abierto | El modal se cierra automáticamente (escuchar cambio de `perfilActivo`).                                                                      |
| `cmd_update_salario_objetivo` falla (IPC error) | El modal NO se cierra; muestra el mensaje del error en el mismo slot del help text.                                                          |

### REQ identifiers

- **REQ-502** (continuación): el requisito existente en `mvp-financiero-local-first/spec.md` §REQ-502 cubre el motor y la lectura. Este change agrega los escenarios de UI (escenarios `@req_502_modal_*` en el archivo `__tests__/ModalSalarioObjetivo.test.tsx`).

### Decisión de scope: NO edit desde `SelectorPerfil`

El `SelectorPerfil.tsx` muestra `salario_personal_objetivo_centavos` como texto (línea 69) pero es DUMB: solo lista perfiles y delega la selección al callback del padre. Agregar edición allí rompería el contrato DUMB del organism, complicaría el ciclo "selector al abrir" (que se re-muestra solo en el primer arranque y al "Cambiar perfil"), y duplicaría el trigger con el nuevo botón del `EstadoResultadosPanel`. Decisión: la edición es **solo desde el botón en `EstadoResultadosPanel`**. El subtítulo del `SelectorPerfil` sigue siendo read-only.

## 5. Deliverable D2 — 5ª tab Presupuesto Mejorado (HU-403 continuación + tab del PRD)

**Trazabilidad**: HU-403 (continuación) + tab "Presupuesto Mejorado" del PRD → REQ-403, REQ-605 (parte matriz mejorada) → Tarea T-403b (nueva).

### Criterio de aceptación

- En el nav de `App.tsx` (líneas 518-570) aparece una **5ª tab "Presupuesto Mejorado"** con `data-testid="tab-presupuesto-mejorado"`. Queda entre "Simulador" y "Resultados" para mantener el flujo narrativo: capturar → presupuestar → simular → ver mejorado → ver estado.
- El type alias pasa a `type TabActiva = 'transacciones' | 'presupuesto' | 'simulador' | 'presupuesto-mejorado' | 'resultados'` (`App.tsx:149`).
- Al activar la tab, se renderiza un nuevo organism `PresupuestoMejoradoPanel` que muestra:
  - **Matriz mejorada** (tabla estilo `MatrizPresupuesto`): filas por categoría, columnas por naturaleza (Necesario / No tan necesario / No necesario), sub-total por fila y fila "Total general". Se renderiza con los mismos molecules que `MatrizPresupuesto.tsx` (atomic design: reutilizar, no duplicar).
  - **KPIs derivados** en una tabla o lista compacta:
    - Total Ingresos (constante vs inicial — debería ser igual: `$7,200,000.00`).
    - Total Gastos Mejorado (golden: `$6,275,000.00` del test `matriz-mejorada.test.ts`).
    - Delta vs inicial: `$6,275,000 - $8,345,000 = -$2,070,000.00` (ahorro).
    - Flujo de Caja Libre Mejorado sin descuento de salario: `$925,000.00`.
  - **Banner superior**: "Esta vista refleja qué pasaría si aplicás las mejoras del Simulador. Sin mejoras aplicadas, la matriz es idéntica a la pestaña Presupuesto." (educa al usuario en el caso `simulaciones.length === 0`).
- El organism **NO incluye gráficos nuevos** (Recharts no se usa en D2). El organism `MatrizPresupuesto` en la tab "Presupuesto" ya cubre distribución gráfica.

### Edge cases

| Caso                                                                                              | Comportamiento esperado                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `simulaciones.length === 0` (usuario nunca usó el Simulador)                                      | Mostrar el banner explicativo arriba. La matriz mejorada se renderiza igual (idéntica a la inicial, porque `calcularMatrizMejorada` con array vacío retorna la matriz base). |
| Sin transacciones (perfil nuevo)                                                                  | Mostrar empty state: "No hay transacciones registradas. Capturá al menos una transacción para ver el presupuesto mejorado." Botón para ir a la tab Transacciones.            |
| Sin perfil activo                                                                                 | El nav de tabs queda igual pero la tab no es routable; se redirige al `SelectorPerfil`. (Replicar el comportamiento actual de las otras tabs.)                               |
| Datos parcialmente corruptos (algún `transaccion_id` de `Simulador` no existe en `Transacciones`) | El motor `calcularMatrizMejorada` ya ignora simulaciones huérfanas (no encuentra match en el Map). El organism no rompe.                                                     |

### REQ identifiers

- **REQ-403** (continuación): el requisito existente en `mvp-financiero-local-first/spec.md` §REQ-403 cubre el algoritmo de left join. Este change agrega los escenarios de UI del organism nuevo (escenarios `@req_403b_organism_*` en `__tests__/PresupuestoMejoradoPanel.test.tsx`).
- **REQ-605** (parte matriz mejorada): el golden test ya valida `$6,275,000.00`. El organism nuevo expone ese mismo total como KPI visible sin recalcular (consume el resultado de `calcularMatrizMejorada`).

### Reuso explícito (no recalcular)

El organism hace **exactamente esto**:

```ts
const matrizMejorada = useMemo(
  () => calcularMatrizMejorada(transacciones, categorias, simulaciones),
  [transacciones, categorias, simulaciones],
)
```

No hay copia de la lógica de left join en el organism. El golden test de `matriz-mejorada.test.ts` sigue siendo la fuente de verdad del cálculo y el organism es un presentador de ese cálculo.

## 6. Restricciones arquitectónicas (preservadas del cambio anterior)

Las decisiones arquitectónicas del change `mvp-financiero-local-first` se mantienen **sin excepción**:

- **Atomic Design**: los nuevos componentes son `organisms` (`PresupuestoMejoradoPanel`, `ModalSalarioObjetivo`). No se crea carpeta `src/pages/`. El modal reusa el patrón full-screen overlay de `SelectorPerfil.tsx` (`fixed inset-0 z-50`).
- **Routing**: state local en `App.tsx` con `tabActiva` → sin React Router. El modal de salario es state local en `EstadoResultadosPanel` (nuevo state `modalAbierto: boolean`).
- **IPC**: wrapper en `src/data/tauri-commands.ts` que llama `invoke('cmd_...', ...)`. El comando Tauri nuevo `cmd_update_salario_objetivo` se agrega en `src-tauri/src/commands.rs` (al lado de `cmd_crear_perfil` / `cmd_obtener_perfil` — NO se crea un nuevo módulo `usuarios/repo.rs` porque la estructura actual del codebase mantiene los commands de `Usuarios` directamente en `commands.rs`; respetar la convención existente).
- **Type discipline**: TypeScript estricto, Rust con `serde`. El nuevo wrapper TS será `actualizarSalarioObjetivo(perfilId: number, centavos: number): Promise<UsuarioDto>`. El comando Rust será `cmd_update_salario_objetivo(perfilId: i64, salarioObjetivoCentavos: i64) -> Result<UsuarioDto, String>`.
- **Precision**: `decimal.js` precision 32, `ROUND_HALF_EVEN`. Los inputs del modal se parsean con `parsePesosInput` (ya existente, no se duplica). La persistencia es en centavos (`×100` antes de INSERT/UPDATE).
- **Testing**: **strict TDD** ya activo. Tests RED antes de implementación (verificar en `vitest.config.ts` + convención de tests existente). Patrón de render: `vitest` + `react-dom/client` + `createRoot` + `act()` directo (sin `@testing-library/react`, regla dura del proyecto — no se agrega dependencia nueva).
- **Migraciones**: **NO se requiere una nueva migración**. La columna `salario_personal_objetivo_centavos` ya existe en `Usuarios` desde `src-tauri/migrations/001_inicial.sql`. El comando `cmd_update_salario_objetivo` solo hace `UPDATE Usuarios SET salario_personal_objetivo_centavos = ?1 WHERE id = ?2`.

### Tabla de archivos esperados

| Archivo                                                                | Tipo           | Acción                                                                               |
| ---------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------ |
| `openspec/changes/mvp-cierre-modal-y-tab5/spec.md`                     | spec           | nuevo (fase posterior)                                                               |
| `openspec/changes/mvp-cierre-modal-y-tab5/design.md`                   | design         | nuevo (fase posterior)                                                               |
| `openspec/changes/mvp-cierre-modal-y-tab5/tasks.md`                    | tasks          | nuevo (fase posterior)                                                               |
| `src/components/organisms/ModalSalarioObjetivo.tsx`                    | organism       | nuevo                                                                                |
| `src/components/organisms/__tests__/ModalSalarioObjetivo.test.tsx`     | test RED       | nuevo                                                                                |
| `src/components/organisms/EstadoResultadosPanel.tsx`                   | organism       | modificar (botón "Editar salario" + state del modal)                                 |
| `src/components/organisms/PresupuestoMejoradoPanel.tsx`                | organism       | nuevo                                                                                |
| `src/components/organisms/__tests__/PresupuestoMejoradoPanel.test.tsx` | test RED       | nuevo                                                                                |
| `src/App.tsx`                                                          | root           | modificar (5ª tab + case en el render)                                               |
| `src/components/organisms/__tests__/EstadoResultadosPanel.test.tsx`    | test           | modificar (escenarios del modal)                                                     |
| `src/data/tauri-commands.ts`                                           | wrapper        | modificar (export `actualizarSalarioObjetivo`)                                       |
| `src/__tests__/tauri-commands.test.ts`                                 | test           | modificar (escenarios del wrapper)                                                   |
| `src-tauri/src/commands.rs`                                            | Rust           | modificar (cmd_update_salario_objetivo + UpdateSalarioObjetivoInput + tests `_impl`) |
| `src-tauri/tests/usuarios_update_test.rs`                              | test RED       | nuevo                                                                                |
| `src-tauri/src/lib.rs`                                                 | Tauri registry | modificar (registrar `cmd_update_salario_objetivo` en `invoke_handler`)              |
| `openspec/changes/mvp-financiero-local-first/MVP-COMPLETE.md`          | doc            | actualizar (marcar pendientes resueltos)                                             |

## 7. Slices / estrategia de PR

Dos slices **stacked-to-main** (default del proyecto, salvo que el forecast de líneas indique otra cosa):

| Slice                                  | Scope                                                                                                  | Líneas estimadas | PR strategy                                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------- | -------------------------------------------------------------------------------------------- |
| **A — D1 modal salario objetivo**      | Rust command + wrapper TS + organism Modal + integración en EstadoResultadosPanel + 3 archivos de test | ~150-250         | Apilado a main, independiente                                                                |
| **B — D2 5ª tab Presupuesto Mejorado** | Organism PresupuestoMejoradoPanel + integración en App.tsx + 2 archivos de test                        | ~150-250         | Apilado a main, depende de A solo en el sentido de cierre de MVP (puede mergear en paralelo) |

**Total estimado**: ~400-500 líneas. Si pasa el threshold de 400 líneas del Review Workload Guard, marcar el slice correspondiente para aplicar el guard. La ejecución es **stacked-to-main** salvo que el forecast de changed-lines indique lo contrario.

## 8. Riesgos

| #   | Riesgo                                                                                           | Probabilidad | Impacto | Mitigación                                                                                                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------ | ------------ | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | El nuevo Tauri command `cmd_update_salario_objetivo` requiere una migración nueva.               | **NULA**     | —       | Verificado: la columna `salario_personal_objetivo_centavos` ya existe en `Usuarios` desde `src-tauri/migrations/001_inicial.sql` (ver `commands.rs` línea 229 y 301). El command hace `UPDATE` plano, sin DDL.                          |
| 2   | El golden test de `matriz-mejorada` falla al activarse la nueva tab.                             | Baja         | Alto    | El organism nuevo **NO recalcula** la matriz: usa `useMemo` con `calcularMatrizMejorada` ya validada. El golden test sigue siendo la fuente de verdad.                                                                                  |
| 3   | El modal de salario rompe el contrato de `boton-crear-perfil` del `SelectorPerfil`.              | Baja         | Bajo    | El modal vive en `EstadoResultadosPanel`, NO en `SelectorPerfil`. No hay superposición de estado.                                                                                                                                       |
| 4   | El usuario quiere editar el salario desde el chip "Cambiar perfil" del header.                   | Media        | Bajo    | Decisión locked #7: NO se permite. El selector es DUMB y la edición es solo desde `EstadoResultadosPanel`. Documentar en el help inline del `SelectorPerfil` ("El salario se edita desde la pestaña Resultados") para reducir fricción. |
| 5   | El cambio de perfil mientras el modal está abierto causa un re-render que descuadra el state.    | Media        | Medio   | Implementar `useEffect` que cierre el modal cuando `perfilActivo` cambia. Documentar en el test RED.                                                                                                                                    |
| 6   | El snapshot `MVP-COMPLETE.md` queda desincronizado al cerrar el change.                          | Baja         | Bajo    | El Definition of Done (§9) obliga a actualizar `MVP-COMPLETE.md` marcando HU-502 ✅ Done, HU-403 con tab separada ✅ Done, épica 5 ✅ Done, épica 4 ✅ Done.                                                                            |
| 7   | Tests de `vitest` no suficientes para verificar el modal (necesitamos `@testing-library/react`). | Baja         | Medio   | Verificado: la regla dura del proyecto es NO agregar dependencias. El patrón `react-dom/client` + `createRoot` + `act()` ya cubre el testing del modal (ver patrón existente en `EstadoResultadosPanel.test.tsx`).                      |
| 8   | El organism `PresupuestoMejoradoPanel` duplica el render de `MatrizPresupuesto`.                 | Baja         | Bajo    | Refactor: extraer el render del molecule `<table>` a un helper interno compartido, o alternativamente aceptar la duplicación local (atomic design permite organisms distintos con su propio JSX). Decisión a tomar en fase de diseño.   |

## 9. Definition of Done

- [ ] Slice A mergeado a main con `cmd_update_salario_objetivo` + `ModalSalarioObjetivo` + integración en `EstadoResultadosPanel`.
- [ ] Slice B mergeado a main con `PresupuestoMejoradoPanel` + 5ª tab en `App.tsx`.
- [ ] Tests verdes: `pnpm test` y `cargo test` corren **sin regresiones** (mínimo 206 tests previos + los nuevos RED→GREEN).
- [ ] `MVP-COMPLETE.md` actualizado:
  - HU-502: ✅ Done
  - HU-403 con tab separada: ✅ Done
  - Épica 5: ✅ Done
  - Épica 4: ✅ Done
- [ ] Cambios `mvp-financiero-local-first` y `mvp-cierre-modal-y-tab5` ambos archivados formalmente.
- [ ] `openspec/specs/mvp-financiero-local-first/spec.md` sincronizado con los delta specs de este nuevo change al archive (nota: el proyecto no usa `openspec/specs/` hoy — el archivado se hace contra `openspec/changes/mvp-financiero-local-first/spec.md`; aplicar el flujo de archivado existente).

## 10. Trazabilidad

| Historia de usuario                                        | REQ              | Tarea          |
| ---------------------------------------------------------- | ---------------- | -------------- |
| HU-502 (continuación)                                      | REQ-502          | T-502 (nueva)  |
| HU-403 (continuación) + tab "Presupuesto Mejorado" del PRD | REQ-403, REQ-605 | T-403b (nueva) |

## 11. Referencias

- Propuesta anterior: `openspec/changes/mvp-financiero-local-first/proposal.md` (decisiones locked #1-6 replicadas en §3).
- Spec anterior: `openspec/changes/mvp-financiero-local-first/spec.md` (19 REQs pre-existentes).
- Snapshot MVP: `openspec/changes/mvp-financiero-local-first/MVP-COMPLETE.md` (lista de pendientes bloqueantes).
- Tabla `Usuarios` con columna `salario_personal_objetivo_centavos`: `src-tauri/migrations/001_inicial.sql`.
- Commands Rust existentes sobre `Usuarios`: `src-tauri/src/commands.rs` (líneas 200-346).
- Motor de matriz mejorada: `src/domain/simulador/matriz-mejorada.ts` (golden test `6,275,000.00` en `__tests__/matriz-mejorada.test.ts`).
- Helper de parsing de moneda: `src/domain/precision/money.ts` (`parsePesosInput`, `formatCentavos`).
- Tab actual de `App.tsx`: línea 149 (`type TabActiva`) y líneas 518-570 (nav).
- Subtítulo actual de salario: `src/components/organisms/EstadoResultadosPanel.tsx` línea 42-46.
- Patrón de tests sin `@testing-library/react`: `src/components/organisms/__tests__/EstadoResultadosPanel.test.tsx` (lineas 65-67).

> **Estado**: propuesta lista para fase de especificación (`sdd-spec`).
