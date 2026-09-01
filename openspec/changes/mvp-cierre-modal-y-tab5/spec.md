# Especificación: Cierre MVP — Modal Salario Objetivo + 5ª Tab Presupuesto Mejorado

> **Trazabilidad**: Este documento es un delta de `openspec/changes/mvp-financiero-local-first/spec.md`.
> Extiende REQ-502, REQ-403 y REQ-605 del spec base con escenarios de UI.
> Propuesta aprobada: `openspec/changes/mvp-cierre-modal-y-tab5/proposal.md`.

---

## Purpose

Completar el MVP agregando dos deliverables pendientes: (D1) modal UI para editar el Salario Personal Objetivo desde el panel de Estado de Resultados, y (D2) la 5ª tab "Presupuesto Mejorado" como tab separada. Ambos extienden requisitos existentes del spec base.

---

## D1 — Modal Salario Objetivo (continuación de REQ-502)

### Requirement REQ-502-D1-1: Botón "Editar salario" visible en EstadoResultadosPanel

El sistema debe mostrar un botón "Editar salario" junto al subtítulo del salario personal objetivo, visible únicamente cuando existe un perfil activo con salario configurado.

#### Scenario: Botón visible con perfil activo y salario configurado

- GIVEN el usuario está en la tab "Resultados" y el perfil activo tiene `salario_personal_objetivo_centavos !== null`
- WHEN se renderiza el panel `EstadoResultadosPanel`
- THEN el botón "Editar salario" es visible junto al subtítulo `formatCentavos(salarioObjetivoCentavos)`
- AND el botón tiene `data-testid="btn-editar-salario"`

**Test:** `src/components/organisms/__tests__/ModalSalarioObjetivo.test.tsx::REQ-502-D1-1`

---

### Requirement REQ-502-D1-2: Apertura del modal con valor pre-cargado

El sistema debe abrir un modal cuando el usuario hace click en "Editar salario", mostrando el valor actual formateado.

#### Scenario: Modal abre con valor actual

- GIVEN el usuario está en la tab "Resultados" con un perfil activo que tiene `salario_personal_objetivo_centavos = 500000000`
- WHEN hace click en "Editar salario"
- THEN se abre el modal `ModalSalarioObjetivo` con el título "Editar salario personal objetivo"
- AND el input muestra el valor pre-cargado y formateado: "5.000.000"
- AND el help text dice: "Este valor se descuenta del Flujo de Ahorro 2 en el Estado de Resultados Mejorado."

**Test:** `src/components/organisms/__tests__/ModalSalarioObjetivo.test.tsx::REQ-502-D1-2`

---

### Requirement REQ-502-D1-3: Guardado exitoso del salario

El sistema debe persistir el nuevo valor y actualizar la UI al completar la operación.

#### Scenario: Guardado con valor válido

- GIVEN el modal está abierto con valor pre-cargado
- WHEN el usuario ingresa el valor "1.500.000" en el input y hace click en "Guardar"
- THEN se invoca `cmd_update_salario_objetivo(perfil_id, 150000000)`
- AND al completarse el modal se cierra
- AND el panel `EstadoResultadosPanel` rehidrata con el nuevo valor formateado: "$1.500.000"
- AND el state `salarioObjetivoCentavos` en `App.tsx` se actualiza sin recarga de la app

**Test:** `src/components/organisms/__tests__/ModalSalarioObjetivo.test.tsx::REQ-502-D1-3`

---

### Requirement REQ-502-D1-4: Validación de input vacío

El sistema debe prevenir el guardado cuando el input está vacío.

#### Scenario: Input vacío deshabilita guardar

- GIVEN el modal está abierto
- WHEN el usuario borra todo el contenido del input
- THEN el botón "Guardar" está deshabilitado
- AND se muestra el mensaje inline "Ingresa un valor"

**Test:** `src/components/organisms/__tests__/ModalSalarioObjetivo.test.tsx::REQ-502-D1-4`

---

### Requirement REQ-502-D1-5: Validación de valor negativo

El sistema debe rechazar valores negativos mostrando un mensaje de error.

#### Scenario: Valor negativo rechazado

- GIVEN el modal está abierto
- WHEN el usuario ingresa "-500000" en el input
- AND hace click en "Guardar"
- THEN `parsePesosInput` retorna `null` para valores negativos
- AND el modal muestra el mensaje "El valor no puede ser negativo"
- AND el modal NO se cierra

**Test:** `src/components/organisms/__tests__/ModalSalarioObjetivo.test.tsx::REQ-502-D1-5`

---

### Requirement REQ-502-D1-6: Validación de valor excede máximo

El sistema debe rechazar valores mayores al límite permitido.

#### Scenario: Valor mayor a 1 billón rechazado

- GIVEN el modal está abierto
- WHEN el usuario ingresa "1.000.000.001" (mayor a $1,000,000,000)
- AND hace click en "Guardar"
- THEN el modal valida `centavos <= 100_000_000_000` antes de invocar el command
- AND muestra el mensaje "El valor excede el máximo permitido"
- AND NO se invoca `cmd_update_salario_objetivo`

**Test:** `src/components/organisms/__tests__/ModalSalarioObjetivo.test.tsx::REQ-502-D1-6`

---

### Requirement REQ-502-D1-7: Cancelar o cerrar backdrop

El sistema debe cerrar el modal sin persistir cuando el usuario cancela o hace click fuera.

#### Scenario: Cancelar cierra sin persistir

- GIVEN el modal está abierto con un valor modificado
- WHEN el usuario hace click en "Cancelar" O hace click en el backdrop
- THEN el modal se cierra
- AND NO se invoca ningún command de actualización
- AND el valor en la UI permanece sin cambios

**Test:** `src/components/organisms/__tests__/ModalSalarioObjetivo.test.tsx::REQ-502-D1-7`

---

### Requirement REQ-502-D1-8: Cambio de perfil cierra modal

El sistema debe cerrar automáticamente el modal cuando el perfil activo cambia.

#### Scenario: Cambio de perfil cierra modal

- GIVEN el modal está abierto
- WHEN el usuario cambia de perfil activo (por ejemplo, hace click en "Cambiar perfil" y selecciona otro)
- THEN el modal se cierra automáticamente
- AND NO se persiste el valor en edición

**Test:** `src/components/organisms/__tests__/ModalSalarioObjetivo.test.tsx::REQ-502-D1-8`

---

### Requirement REQ-502-D1-9: Error de IPC muestra mensaje

El sistema debe mostrar el error cuando falla la comunicación con el backend.

#### Scenario: Error de command muestra help text

- GIVEN el modal está abierto con un valor válido
- WHEN el usuario hace click en "Guardar"
- AND `cmd_update_salario_objetivo` retorna error (IPC failure, por ejemplo: "Perfil no encontrado")
- THEN el modal NO se cierra
- AND se muestra el mensaje del error en el slot del help text

**Test:** `src/components/organisms/__tests__/ModalSalarioObjetivo.test.tsx::REQ-502-D1-9`

---

### Requirement REQ-502-D1-10: Actualización de state sin recarga

El sistema debe actualizar el valor en memoria sin requerir recarga de la aplicación.

#### Scenario: State se actualiza en memoria

- GIVEN el usuario tiene un perfil activo con `salario_personal_objetivo_centavos = 500000000`
- WHEN se guarda exitosamente un nuevo valor "600000000"
- THEN el state `salarioObjetivoCentavos` en `App.tsx` se actualiza a `600000000`
- AND el subtítulo del `EstadoResultadosPanel` refleja el nuevo valor sin page reload

**Test:** `src/components/organisms/__tests__/ModalSalarioObjetivo.test.tsx::REQ-502-D1-10`

---

### Requirement REQ-502-D1-11: Sin perfil activo no renderiza botón

El sistema no debe mostrar el botón de edición cuando no hay perfil activo.

#### Scenario: Sin perfil activo no hay botón

- GIVEN NO hay perfil activo (perfil null)
- WHEN se renderiza `EstadoResultadosPanel`
- THEN el botón "Editar salario" NO se renderiza
- AND el subtítulo del salario puede mostrar "--" o valor vacío

**Test:** `src/components/organisms/__tests__/ModalSalarioObjetivo.test.tsx::REQ-502-D1-11`

---

## D2 — 5ª Tab Presupuesto Mejorado (continuación de REQ-403)

### Requirement REQ-403-D2-1: Navegación a la 5ª tab

El sistema debe permitir navegar a la tab "Presupuesto Mejorado" desde el nav de la aplicación.

#### Scenario: Click en tab Presupuesto Mejorado

- GIVEN el usuario está en cualquier tab de la aplicación
- WHEN hace click en la 5ª tab "Presupuesto Mejorado" (con `data-testid="tab-presupuesto-mejorado"`)
- THEN `App.tsx` cambia `tabActiva` a `'presupuesto-mejorado'`
- AND se renderiza el organism `PresupuestoMejoradoPanel`

**Test:** `src/components/organisms/__tests__/PresupuestoMejoradoPanel.test.tsx::REQ-403-D2-1`

---

### Requirement REQ-403-D2-2: Renderizado de matriz mejorada

El sistema debe calcular y mostrar la matriz mejorada cuando hay transacciones y simulaciones.

#### Scenario: Matriz mejorada con datos completos

- GIVEN la tab "Presupuesto Mejorado" está activa
- AND hay transacciones en la base de datos
- AND hay simulaciones aplicadas en el simulador
- WHEN se renderiza `PresupuestoMejoradoPanel`
- THEN se muestra la matriz mejorada llamada desde `calcularMatrizMejorada(transacciones, categorias, simulaciones)`
- AND se renderiza con `useMemo` para evitar recálculos innecesarios
- AND los gastos "Necesario" mantienen sus valores originales
- AND los gastos "No necesario" y "No tan necesario" usan los valores del simulador

**Test:** `src/components/organisms/__tests__/PresupuestoMejoradoPanel.test.tsx::REQ-403-D2-2`

---

### Requirement REQ-403-D2-3: Banner cuando no hay simulaciones

El sistema debe mostrar un banner educativo cuando no hay simulaciones aplicadas.

#### Scenario: Banner explicativo sin simulaciones

- GIVEN la tab "Presupuesto Mejorado" está activa
- AND hay transacciones pero `simulaciones.length === 0`
- WHEN se renderiza el organism
- THEN se muestra el banner: "Esta vista refleja qué pasaría si aplicás las mejoras del Simulador. Sin mejoras aplicadas, la matriz es idéntica a la pestaña Presupuesto."
- AND la matriz mejorada se renderiza igual (es idéntica a la matriz base)

**Test:** `src/components/organisms/__tests__/PresupuestoMejoradoPanel.test.tsx::REQ-403-D2-3`

---

### Requirement REQ-403-D2-4: Empty state sin transacciones

El sistema debe mostrar un mensaje instructivo cuando no hay transacciones registradas.

#### Scenario: Sin transacciones muestra empty state

- GIVEN la tab "Presupuesto Mejorado" está activa
- AND NO hay transacciones en la base de datos (perfil nuevo)
- WHEN se renderiza el organism
- THEN se muestra el empty state con mensaje: "No hay transacciones registradas. Capturá al menos una transacción para ver el presupuesto mejorado."
- AND se muestra un botón que cambia `tabActiva` a `'transacciones'`

**Test:** `src/components/organisms/__tests__/PresupuestoMejoradoPanel.test.tsx::REQ-403-D2-4`

---

### Requirement REQ-403-D2-5: KPI Total Gastos Mejorado con golden value

El sistema debe mostrar el KPI "Total Gastos Mejorado" con el golden value validado.

#### Scenario: KPI muestra golden value

- GIVEN la tab está activa y hay datos
- AND los cálculos se completan exitosamente
- WHEN se renderiza el organism
- THEN el KPI "Total Gastos Mejorado" muestra `$6,275,000.00`
- AND este valor es el golden de `matriz-mejorada.test.ts` sin recalcular

**Test:** `src/components/organisms/__tests__/PresupuestoMejoradoPanel.test.tsx::REQ-403-D2-5`

---

### Requirement REQ-403-D2-6: Sin perfil activo redirige al selector

El sistema debe impedir el acceso a la tab sin perfil activo.

#### Scenario: Sin perfil activo no permite acceso

- GIVEN NO hay perfil activo
- WHEN el usuario intenta navegar a la tab "Presupuesto Mejorado"
- THEN la tab NO es routable
- AND se redirige al `SelectorPerfil`

**Test:** `src/components/organisms/__tests__/PresupuestoMejoradoPanel.test.tsx::REQ-403-D2-6`

---

### Requirement REQ-403-D2-7: Datos parcialmente corruptos no rompen el render

El sistema debe manejar gracefully datos corruptos donde simulaciones referencian transacciones inexistentes.

#### Scenario: Simulaciones huérfanas ignoradas

- GIVEN la tab está activa y hay datos
- AND existe alguna simulación con `transaccion_id` que NO existe en la tabla Transacciones
- WHEN se renderiza el organism
- THEN `calcularMatizMejorada` ignora las simulaciones huérfanas
- AND el organism renderiza sin error
- AND solo se usan las simulaciones que tienen match en transacciones

**Test:** `src/components/organisms/__tests__/PresupuestoMejoradoPanel.test.tsx::REQ-403-D2-7`

---

### Requirement REQ-403-D2-8: Test id en el nav de tabs

El sistema debe tener un identificador para testing en la navegación de tabs.

#### Scenario: Test id presente en nav

- GIVEN la aplicación está renderizada
- WHEN se inspecciona el nav de tabs en `App.tsx`
- THEN existe un elemento con `data-testid="tab-presupuesto-mejorado"`
- AND está posicionado entre "Simulador" y "Resultados"

**Test:** `src/components/organisms/__tests__/PresupuestoMejoradoPanel.test.tsx::REQ-403-D2-8`

---

## REQ-605 — Golden Exposed (extensión)

### Requirement REQ-605-D2-1: KPI cierra al centavo contra golden

El sistema debe exponer el valor visible "Total Gastos Mejorado" que cierra exactamente contra el golden test.

#### Scenario: Golden value expuesto en UI

- GIVEN el organism renderiza y hay simulaciones aplicadas
- WHEN se visualiza el KPI "Total Gastos Mejorado"
- THEN el valor cierra al centavo contra el golden `6,275,000.00`
- AND este valor fue validado en `src/domain/simulador/__tests__/matriz-mejorada.test.ts`

**Test:** `src/components/organisms/__tests__/PresupuestoMejoradoPanel.test.tsx::REQ-605-D2-1`

---

## Resumen de Cobertura

| Tipo                             | Cantidad |
| -------------------------------- | -------- |
| Requisitos D1 (Modal)            | 11       |
| Requisitos D2 (Tab)              | 8        |
| Requisitos REQ-605               | 1        |
| Total nuevos escenarios          | 20       |
| Escenarios heredados (spec base) | 38       |

| REQ base extendido | Tipo de extensión                   |
| ------------------ | ----------------------------------- |
| REQ-502            | 11 escenarios de UI (D1)            |
| REQ-403            | 8 escenarios de organism (D2)       |
| REQ-605            | 1 escenario de golden expuesto (D2) |

---

## Constraints Documentados

- **Atomic Design**: `ModalSalarioObjetivo` y `PresupuestoMejoradoPanel` son organisms. No se crea `src/pages/`.
- **Routing**: state local en `App.tsx` con `tabActiva`. Sin React Router.
- **IPC wrapper**: `invoke('cmd_update_salario_objetivo', { ... })` via `src/data/tauri-commands.ts`.
- **Sin migración**: la columna `salario_personal_objetivo_centavos` ya existe.
- **Sin @testing-library/react**: se usa el patrón `react-dom/client` + `createRoot` + `act()` existente.
- **TDD strict**: todos los escenarios deben tener al menos un test RED antes de implementación.

---

## Out of Scope

- Multi-currency, cloud sync, dark mode
- Exportación a Excel/PDF/CSV
- Open Finance, push notifications
- Scroll virtualizado, WCAG AA
- Mod de creación de perfil nuevo (ya existe en slice 14)
