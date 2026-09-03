# Progreso de Implementación: v3-dashboard-ui

**Fecha**: 2026-09-03
**Modo**: Standard (sin Strict TDD)
**Unidad de trabajo actual**: Phase 2 — Micro-chunk 2.5 + 2.6 (RightDrawer)

---

## Tareas completadas

- [x] **1.1** Configurar paleta Salmón (`salmon: '#f05454'`) y tipografía Raleway en `tailwind.config.js`.
- [x] **1.2** Agregar imports de fuentes Raleway, estilos base Dark Mode (`bg-zinc-950`) y regla utilitaria `tabular-nums` en `src/index.css`.
- [x] **2.1** Crear `src/components/templates/DashboardLayout.tsx` con contenedor Flexbox `h-screen overflow-hidden` y 3 slots (`sidebar`, `main`, `drawer`).
- [x] **2.2** Crear tests unitarios en `src/components/templates/__tests__/DashboardLayout.test.tsx` verificando renderizado de slots y visibilidad de drawer.
- [x] **2.3** Crear `src/components/organisms/Sidebar.tsx` preservando `data-testid="tab-*"`, roles ARIA, paleta V3 Dark Mode (`bg-zinc-900`, acento Salmón), chip de perfil y toggle modo mejorado.
- [x] **2.4** Crear tests unitarios en `src/components/organisms/__tests__/Sidebar.test.tsx` — 22 tests verificando: presencia de todos los data-testid, tab activa (aria-selected), callbacks onTabChange y onToggleModoMejorado, perfil activo con nombre/null, selectorPerfilSlot inyectado y roles ARIA (tablist, tab).
- [x] **2.5** Crear `src/components/organisms/RightDrawer.tsx` con panel colapsable (`data-testid="right-drawer"`), cabecera con título, botón "Cerrar" (`data-testid="right-drawer-close"`), `aria-hidden` condicional y contenedor con scroll para children.
- [x] **2.6** Crear tests unitarios en `src/components/organisms/__tests__/RightDrawer.test.tsx` — 11 tests verificando: data-testid del panel y botón, aria-hidden según isOpen, título en cabecera, callback onClose al click, children renderizados (uno, múltiples, null), y aria-label refleja titulo.

## Tareas pendientes

- [ ] 3.1 Declarar estado `drawerOpen` y orquestar `DashboardLayout` en `src/App.tsx`
- [ ] 3.2 Conectar `TransaccionForm` dentro del slot `drawer` en `src/App.tsx`
- [ ] 3.3 Mapear vistas centrales en el slot `main` de `src/App.tsx`
- [ ] 3.4 Asegurar que `SelectorPerfil` se renderice como overlay `fixed inset-0 z-50` en `src/App.tsx`
- [ ] 4.1 Ejecutar suite completa con `npm test` (170+ tests al 100%)
- [ ] 4.2 Validar consistencia de `tabular-nums` y ajuste 1080p sin scroll global

---

## Evidencia de la unidad de trabajo (Work Unit Evidence) — Phase 2 micro-chunk 2.5+2.6

| Evidencia | Resultado |
|-----------|-----------|
| Comando de test enfocado | `npx vitest run src/components/organisms/__tests__/RightDrawer.test.tsx` → **11/11 ✅ passed** (3.95s) |
| Comando de test de regresión (3 archivos) | `npx vitest run src/components/templates/__tests__/DashboardLayout.test.tsx src/components/organisms/__tests__/Sidebar.test.tsx src/components/organisms/__tests__/RightDrawer.test.tsx` → **42/42 ✅ passed** (DashboardLayout 9/9 + Sidebar 22/22 + RightDrawer 11/11) |
| Runtime harness | `N/A` — RightDrawer es componente dumb (presentación pura, sin estado, sin IPC, sin rutas de ejecución runtime). El posicionamiento y transiciones CSS son responsabilidad del DashboardLayout padre. |
| Límite de rollback | Eliminar `src/components/organisms/RightDrawer.tsx` y `src/components/organisms/__tests__/RightDrawer.test.tsx`. Ningún otro archivo fue modificado en este micro-chunk. |

---

## Evidencia de la unidad de trabajo (Work Unit Evidence) — Phase 2 micro-chunk 2.3+2.4

| Evidencia | Resultado |
|-----------|-----------|
| Comando de test enfocado | `npx vitest run src/components/organisms/__tests__/Sidebar.test.tsx` → **22/22 ✅ passed** (291ms) |
| Comando de test de regresión | `npx vitest run src/components/templates/__tests__/DashboardLayout.test.tsx src/components/organisms/__tests__/Sidebar.test.tsx` → **31/31 ✅ passed** (DashboardLayout 9/9 + Sidebar 22/22) |
| Runtime harness | `N/A` — Sidebar es componente dumb (presentación pura, sin estado, sin IPC, sin rutas de ejecución runtime). |
| Límite de rollback | Eliminar `src/components/organisms/Sidebar.tsx`, `src/components/organisms/__tests__/Sidebar.test.tsx` y `src/types/tabs.ts`. Ningún otro archivo fue modificado en este micro-chunk. |

---

## Evidencia de la unidad de trabajo (Work Unit Evidence) — Phase 2 micro-chunk 2.1+2.2

| Evidencia | Resultado |
|-----------|-----------|
| Comando de test enfocado | `npx vitest run src/components/templates/__tests__/DashboardLayout.test.tsx` → **9/9 ✅ passed** (127ms) |
| Runtime harness | `N/A` — componente dumb (template de presentación pura, sin estado, sin llamadas IPC, sin rutas de ejecución de runtime). |
| Límite de rollback | Eliminar `src/components/templates/DashboardLayout.tsx` y `src/components/templates/__tests__/DashboardLayout.test.tsx`. Ningún otro archivo fue modificado en este micro-chunk. |

---

## Evidencia de la unidad de trabajo (Work Unit Evidence) — Phase 1

| Evidencia | Resultado |
|-----------|-----------|
| Comando de test enfocado | `npx vitest run src/data/__tests__/tauri-commands.test.ts` → 18/18 ✅ passed (43ms) |
| Runtime harness | `N/A` — Phase 1 solo modifica configuración CSS/Tailwind; ningún componente o ruta de ejecución es afectada |
| Límite de rollback | Revertir `tailwind.config.js` y `src/index.css` a su estado anterior (git revert del commit de Phase 1). Ningún otro archivo fue modificado. |

### Nota sobre el runner completo

`npm test` (vitest run sin filtros) termina con un crash del worker Tinypool en el contexto CI/jsdom de este entorno. Este fallo es pre-existente y no relacionado con Phase 1: los archivos modificados (`tailwind.config.js`, `src/index.css`) no son importados por ningún test file. Confirmado con `grep` sobre el árbol `src/**/*.test.*`.

---

## Archivos creados / modificados

| Archivo | Acción | Descripción |
|---------|--------|-------------|
| `tailwind.config.js` | Modificado | Paleta `salmon` con escala completa (50–900, DEFAULT = `#f05454`) + `fontFamily.sans` → Raleway |
| `src/index.css` | Modificado | Import Google Fonts Raleway (400/500/600/700 + itálica); `@layer base` con `bg-zinc-950 text-slate-200 font-sans antialiased` y `font-variant-numeric: tabular-nums` en body; `@layer utilities` con alias `.tabular-nums` |
| `src/components/templates/DashboardLayout.tsx` | Creado | Template flexbox `h-screen overflow-hidden`, 3 slots (sidebar `w-64`, main `flex-1`, drawer `w-80`), backdrop overlay para mobile, transición `duration-200` |
| `src/components/templates/__tests__/DashboardLayout.test.tsx` | Creado | 9 tests: root container, 3 slots, backdrop condicional, clases translate-x-full/absent por `drawerOpen` |
| `src/types/tabs.ts` | Creado | Tipo compartido `TabActiva` extraído de App.tsx para evitar dependencia circular; Sidebar y sus tests lo importan de aquí |
| `src/components/organisms/Sidebar.tsx` | Creado | Nav vertical: 5 tabs con data-testid, role="tab", aria-selected; toggle modo mejorado (aria-pressed); chip perfil activo; selectorPerfilSlot ReactNode; colores V3 Dark Mode (`bg-zinc-900`, texto `slate-400`, activo `salmon`) |
| `src/components/organisms/__tests__/Sidebar.test.tsx` | Creado | 22 tests: estructura ARIA (nav, tablist, tab × 5), data-testid × 7, tab activa aria-selected, callbacks onTabChange y onToggleModoMejorado, perfil activo nombre/null, selectorPerfilSlot inyectado |
| `src/components/organisms/RightDrawer.tsx` | Creado | Panel `<section>` con `data-testid="right-drawer"`, `aria-hidden` condicional, cabecera con `<h2>` (titulo) + botón cerrar (`data-testid="right-drawer-close"`), área de contenido scrollable para children; colores V3 Dark Mode (`bg-zinc-900`, bordes `border-white/10`) |
| `src/components/organisms/__tests__/RightDrawer.test.tsx` | Creado | 11 tests: data-testid del panel y botón, aria-hidden según isOpen, titulo en h2, callback onClose, children inyectados (uno/múltiples/null), aria-label refleja titulo |

---

## Presupuesto de revisión

- **Líneas cambiadas (acumulado Phase 1 + 2.1+2.2 + 2.3+2.4 + 2.5+2.6)**: ~336 (prev) + ~95 (RightDrawer + test) ≈ **+431 / -1** total
- **Riesgo presupuesto 400 líneas**: Bajo-Moderado (acumulado supera el estimado original de ~280 por la cobertura de tests, pero se mantiene cohesivo como Single PR dada la granularidad micro-chunk)
- **Modo de entrega**: Single PR
- **Límite de la unidad actual**: Phase 2 micro-chunk 2.5+2.6 — inicia desde `organisms/` sin RightDrawer, termina con RightDrawer + 11 tests pasando

---

## Desviaciones del diseño

### Desviación 1: `selectorPerfilSlot` vs. `onCambiarPerfil`

- **Design.md**: especifica `onCambiarPerfil: () => void` como callback.
- **Implementación**: se usó `selectorPerfilSlot: ReactNode` como slot de composición.
- **Razón**: las instrucciones del orquestador (Task 2.3) especifican explícitamente `selectorPerfilSlot (ReactNode)` porque el `SelectorPerfil` se renderiza como overlay global controlado por App.tsx (design.md §Flujo de Datos). El slot permite inyectar directamente el overlay sin requerir que el Sidebar tenga acceso al componente SelectorPerfil ni a su estado. Esta desviación es intencionada y sigue el espíritu del design.md.

### Desviación 2: Tipo `TabActiva` en archivo compartido

- **Design.md / Tasks**: no especifican dónde debe vivir el tipo.
- **Implementación**: se creó `src/types/tabs.ts` en lugar de exportar desde `App.tsx`.
- **Razón**: App.tsx define `TabActiva` localmente dentro de la función `App()` (línea 151), lo que impide exportarlo sin modificar App.tsx (reservado para Task 3.1). Crear un archivo de tipos compartido es la solución más segura para los tests existentes y para la fase de integración.

### Desviación 3: RightDrawer — sin lógica de posicionamiento inline

- **Design.md §Estrategia Responsiva**: describe clases de posicionamiento (`fixed inset-y-0`, `translate-x-full`, etc.) para el RightDrawer.
- **Implementación**: esas clases viven en `DashboardLayout.tsx` (en el `<aside data-testid="dashboard-drawer">`), NO dentro de `RightDrawer.tsx`. El componente RightDrawer se limita a su estructura interna (cabecera + área scrollable).
- **Razón**: la instrucción del orquestador especifica explícitamente que "la mecánica de sliding y posicionamiento es responsabilidad del padre `DashboardLayout`". Esta separación es correcta y sigue el principio dumb-component.

---

## Estado

**8/12 tareas completadas** (Phase 1: 2/2 ✅ · Phase 2: 2.1+2.2+2.3+2.4+2.5+2.6 ✅). Listo para Phase 3 (integración en App.tsx).
