# Tareas: Rediseño Dashboard V3 (UI Flexbox 3 Columnas)

## Review Workload Forecast

| Campo | Valor |
|-------|-------|
| Líneas cambiadas estimadas | ~280 líneas (+200 / -80) |
| Riesgo presupuesto 400 líneas | Low |
| Chained PRs recomendados | No |
| División sugerida | PR único (Single PR) |
| Delivery strategy | single-pr |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Fundaciones V3, componentes de presentación puros y tests unitarios | PR 1 | `npx vitest run src/components/templates/__tests__/DashboardLayout.test.tsx src/components/organisms/__tests__/Sidebar.test.tsx src/components/organisms/__tests__/RightDrawer.test.tsx` | N/A (componentes UI puros) | Eliminar nuevos archivos en `src/components/templates/` y `src/components/organisms/` |
| 2 | Integración y orquestación en `App.tsx` preservando contratos TDD | PR 1 | `npm test` | `npm test` | Revertir `src/App.tsx` |

## Phase 1: Fundaciones y Configuración Visual V3

- [x] 1.1 Configurar paleta Salmón (`salmon: '#f05454'`) y tipografía Raleway en `tailwind.config.js`.
- [x] 1.2 Agregar imports de fuentes Raleway, estilos base Dark Mode (`bg-zinc-950`) y regla utilitaria `tabular-nums` en `src/index.css`.

## Phase 2: Componentes de Presentación Puros (Dumb Components)

- [x] 2.1 Crear `src/components/templates/DashboardLayout.tsx` con contenedor Flexbox `h-screen overflow-hidden` y 3 slots (`sidebar`, `main`, `drawer`).
- [x] 2.2 Crear tests unitarios en `src/components/templates/__tests__/DashboardLayout.test.tsx` verificando renderizado de slots y visibilidad de drawer.
- [x] 2.3 Crear `src/components/organisms/Sidebar.tsx` preservando `data-testid="tab-transacciones"`, `data-testid="tab-presupuesto"`, `data-testid="tab-simulador"`, `data-testid="tab-presupuesto-mejorado"`, `data-testid="tab-resultados"`, `data-testid="perfil-activo-chip"`, `data-testid="boton-toggle-modo-mejorado"`.
- [x] 2.4 Crear tests unitarios en `src/components/organisms/__tests__/Sidebar.test.tsx` verificando navegación de tabs y callbacks de perfil.
- [x] 2.5 Crear `src/components/organisms/RightDrawer.tsx` con panel colapsable (`data-testid="right-drawer"`), backdrop y contenedor para `TransaccionForm`.
- [x] 2.6 Crear tests unitarios en `src/components/organisms/__tests__/RightDrawer.test.tsx` verificando toggling y botón cerrar.

## Phase 3: Cableado e Integración en App.tsx

- [x] 3.1 Declarar estado `drawerOpen` y orquestar `DashboardLayout` con `Sidebar`, `MainStage` y `RightDrawer` en `src/App.tsx`.
- [x] 3.2 Conectar `TransaccionForm` dentro del slot `drawer` en `src/App.tsx` preservando `formKey`, submit handlers y status panel.
- [x] 3.3 Mapear vistas centrales (`ListaTransacciones`, `MatrizPresupuesto`, `SimuladorPanel`, `PresupuestoMejoradoPanel`, `EstadoResultadosPanel`, `DistribucionChart`) en el slot `main` de `src/App.tsx`.
- [x] 3.4 Asegurar que `SelectorPerfil` se renderice como overlay global `fixed inset-0 z-50` fuera del `DashboardLayout` en `src/App.tsx`.

## Phase 4: Verificación y Pruebas de Regresión

- [x] 4.1 Ejecutar suite completa con `npm test` verificando que los 170+ tests pasen al 100% sin regresiones en `src/__tests__/App.test.tsx`.
- [x] 4.2 Validar consistencia de clases `tabular-nums` y ajuste 1080p sin scroll global.

## Missed Scope (Post-Verify additions)

- [x] MS-1 Dark Mode sweep for `SelectorPerfil.tsx` — replace all legacy Light Mode classes with V3 Dark Mode tokens. Salmon accent on primary action buttons.
- [x] MS-2 Add `darkMode: 'class'` to `tailwind.config.js` — enables Tailwind's class-based dark mode toggle as foundation for future Light Mode switch.
- [ ] MS-3 Light Mode toggle — see architectural findings in apply-progress. Deferred: requires `dark:` prefix retrofit across all components or CSS variables approach.
