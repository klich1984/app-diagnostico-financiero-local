# Especificación: v3-dashboard-layout

## Purpose

Establecer la especificación funcional y visual para la arquitectura del Dashboard V3 en 3 columnas Flexbox (Sidebar, MainStage, RightDrawer), garantizando el cumplimiento de la identidad visual V3 (Dark Mode `bg-zinc-950`, acento Salmón `#f05454`, `tabular-nums`) y asegurando la compatibilidad retroactiva total con los 169 tests de integración y unidad existentes (TDD estricto).

## Requirements

### Requirement: Layout Flexbox de 3 columnas para viewport 1080p

El sistema DEBE renderizar la interfaz principal en un contenedor Flexbox (`DashboardLayout`) estructurado en 3 columnas independientes (`Sidebar`, `MainStage`, `RightDrawer`) sin desbordamiento ni scroll global en viewports desktop 1080p.

#### Scenario: Visualización en viewport 1080p sin scroll global

- GIVEN la aplicación se ejecuta en una pantalla de escritorio de 1920x1080
- WHEN se renderiza la plantilla `DashboardLayout`
- THEN la vista ocupa el 1080p fit (`h-screen overflow-hidden`)
- AND las 3 columnas (`Sidebar`, `MainStage`, `RightDrawer`) gestionan su scroll vertical internamente

#### Scenario: Adaptación con RightDrawer colapsado

- GIVEN el usuario cierra el `RightDrawer`
- WHEN la propiedad `drawerOpen` cambia a `false`
- THEN `MainStage` expande su ancho dinámicamente ocupando el espacio restante
- AND el `Sidebar` mantiene su ancho fijo (`w-64`)

---

### Requirement: Adaptabilidad Responsiva para Viewports Menores a 1080p

El sistema DEBE mantener la integridad funcional y estética del layout al redimensionar la ventana en viewports reducidos, garantizando que el diseño no se rompa en ninguna resolución.

#### Scenario: Comportamiento del RightDrawer como overlay en pantallas reducidas

- GIVEN la ventana de la aplicación se redimensiona a un viewport inferior a 1080p (breakpoints `< lg` o `< xl` de Tailwind)
- WHEN el usuario abre o interactúa con el `RightDrawer`
- THEN el `RightDrawer` se superpone sobre el `MainStage` operando como un panel overlay (posicionamiento absoluto o fijo)
- AND el flujo de trabajo en la pantalla principal no genera desbordamientos ni rupturas de layout

---

### Requirement: Navegación y Perfil en Sidebar

El componente `Sidebar` DEBE actuar como organism de navegación vertical, preservando los botones de tabulación (`data-testid="tab-*"`), roles ARIA (`role="navigation"`, `role="tab"`) y el selector de perfil activo.

#### Scenario: Cambio de tab desde el Sidebar

- GIVEN el usuario está en la vista `transacciones`
- WHEN hace click en el botón de navegación "Simulador" con `data-testid="tab-simulador"`
- THEN `App.tsx` actualiza el estado `tabActiva` a `'simulador'`
- AND el `MainStage` renderiza `SimuladorPanel` sin recargar la página

#### Scenario: Preservación de perfil activo en Sidebar

- GIVEN existe un perfil activo cargado en la aplicación
- WHEN se renderiza el `Sidebar`
- THEN se muestra el chip de perfil con `data-testid="perfil-activo-chip"`
- AND la interacción con el selector de perfil (`data-testid="selector-perfil"`) mantiene todos los flujos de creación/renombrado

#### Scenario: Preservación de SelectorPerfil como modal overlay global multi-usuario

- GIVEN el usuario requiere crear, renombrar o eliminar perfiles en la aplicación multi-usuario
- WHEN el usuario hace click en el chip de perfil (`data-testid="perfil-activo-chip"`) o activa el selector de perfil desde el `Sidebar`
- THEN el componente `SelectorPerfil` se renderiza como un modal Overlay global superpuesto sobre la totalidad del `DashboardLayout`
- AND se conservan todas las funcionalidades de gestión multi-usuario (crear, editar, renombrar y eliminar perfiles)

---

### Requirement: Captura y Edición en RightDrawer

El componente `RightDrawer` DEBE contener el formulario de transacciones (`TransaccionForm`), permitiendo crear y editar movimientos sin romper los contratos de `data-testid` ni los eventos de submit/cancelar.

#### Scenario: Apertura del Drawer para nueva transacción

- GIVEN el usuario hace click en el botón "Nueva Transacción" o activa el drawer
- WHEN el `RightDrawer` pasa a estado abierto (`isOpen = true`)
- THEN se muestra la vista de captura con `data-testid="right-drawer"`
- AND el formulario `TransaccionForm` está listo para recibir entradas

#### Scenario: Cancelación de edición en RightDrawer

- GIVEN el usuario está editando una transacción dentro del `RightDrawer`
- WHEN hace click en el botón con `data-testid="cancelar-edicion"`
- THEN el formulario limpia el estado de edición
- AND el `RightDrawer` se cierra o retorna a su estado de captura inicial

---

### Requirement: Identidad Visual V3 e Impeccable Design Mandates

El sistema DEBE aplicar la paleta oscura profunda (`bg-zinc-950` / `bg-zinc-900`), bordes sutiles `border-white/10`, el color de acento Salmón (`#f05454`) y alineación numérica estricta con la clase Tailwind `tabular-nums`.

#### Scenario: Aplicación de números tabulares en cifras financieras

- GIVEN se muestran celdas o elementos con montos financieros, centavos o porcentajes
- WHEN se inspecciona el DOM de `MainStage`, `RightDrawer` o componentes financieros
- THEN todos los nodos de cifras contienen la clase `tabular-nums`
- AND la alineación tipográfica de números se mantiene fija verticalmente

#### Scenario: Paleta de color y acentos V3

- GIVEN se renderiza la UI del Dashboard V3
- WHEN se evalúan los estilos de fondo y acentos
- THEN el contenedor principal utiliza `bg-zinc-950` y las tarjetas/paneles `bg-zinc-900`
- AND los elementos interactivos primarios y estados activos utilizan el acento Salmón `#f05454`

---

### Requirement: Preservación Estricta de la Suite de Pruebas (Strict TDD)

El sistema DEBE conservar sin modificaciones todos los atributos `data-testid`, roles de accesibilidad y firmas de estado requeridas por la suite de Vitest de 169 pruebas integrales.

#### Scenario: Ejecución limpia de Vitest

- GIVEN la reestructuración de componentes en `DashboardLayout`, `Sidebar`, `MainStage` y `RightDrawer`
- WHEN se ejecuta la suite completa de pruebas (`npm test` / Vitest)
- THEN los 169 tests pasan al 100% en verde (0 regressions)
- AND ninguna consulta de selector por `data-testid` o `role` falla
