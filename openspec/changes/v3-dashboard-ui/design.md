# Diseño: Rediseño Dashboard V3 (UI Flexbox 3 Columnas)

## Enfoque Técnico

Extraer la UI monolítica de `App.tsx` en 3 componentes de presentación puros (`Sidebar`, `MainStage`, `RightDrawer`) orquestados por un template `DashboardLayout`. `App.tsx` retiene TODO el estado y lógica de negocio — los componentes nuevos son 100% dumb (reciben props, emiten callbacks). Cero cambios en `domain/`, `data/`, o `src-tauri/`.

## Decisiones de Arquitectura

| Decisión | Opciones | Elección | Razón |
|----------|----------|----------|-------|
| Ubicación de `drawerOpen` | Context dedicado vs. `App.tsx` state | `App.tsx` `useState` | Único consumidor; un Context agrega indirección innecesaria sin beneficio |
| Patrón de composición | Compound components vs. props drilling | Props drilling explícito | El árbol es poco profundo (1 nivel); compound components agrega complejidad sin escalabilidad real en este caso |
| Categoría Atomic Design | `organisms/` vs. `templates/` para `DashboardLayout` | `templates/DashboardLayout` + `organisms/Sidebar` + `organisms/RightDrawer` | Separación clara: template = estructura de página, organism = bloque funcional reutilizable |
| Responsividad del Drawer | Media query CSS vs. Tailwind breakpoints | Tailwind breakpoints (`lg:`) | Consistente con el stack existente; sin JS adicional para detectar viewport |

## Flujo de Datos

```
App.tsx (state owner)
  │
  ├── drawerOpen, tabActiva, transacciones, categorias, perfiles...
  │
  └── DashboardLayout ─── composición via children/slots
        ├── Sidebar ←── tabActiva, perfilActivoNombre, onTabChange, onCambiarPerfil, modoMejorado, onToggleModoMejorado
        ├── MainStage ←── tabActiva + children del tab activo (ListaTransacciones, MatrizPresupuesto, etc.)
        └── RightDrawer ←── isOpen, onClose, children (TransaccionForm + status panel)

  SelectorPerfil ←── overlay global z-50 (sin cambios, se renderiza FUERA del DashboardLayout)
```

## Cambios en Archivos

| Archivo | Acción | Descripción |
|---------|--------|-------------|
| `src/components/templates/DashboardLayout.tsx` | Crear | Contenedor Flexbox `h-screen overflow-hidden` con 3 slots (sidebar, main, drawer) |
| `src/components/organisms/Sidebar.tsx` | Crear | Navegación vertical con tabs, chip de perfil, toggle modo mejorado, botón exportar |
| `src/components/organisms/RightDrawer.tsx` | Crear | Panel lateral colapsable con TransaccionForm + feedback de submit |
| `src/App.tsx` | Modificar | Agregar `drawerOpen` state; reemplazar JSX inline por composición DashboardLayout → Sidebar + MainStage + RightDrawer |
| `src/index.css` | Modificar | Agregar import Raleway, regla `tabular-nums`, variables Dark Mode (`bg-zinc-950`) |
| `tailwind.config.js` | Modificar | Extender tema con color `salmon: '#f05454'` y font-family Raleway |

## Interfaces / Contratos

```typescript
// DashboardLayout.tsx
interface DashboardLayoutProps {
  sidebar: ReactNode
  main: ReactNode
  drawer: ReactNode
  drawerOpen: boolean
}

// Sidebar.tsx
interface SidebarProps {
  tabActiva: string
  onTabChange: (tab: string) => void
  perfilActivoNombre: string | null
  onCambiarPerfil: () => void
  modoMejorado: boolean
  onToggleModoMejorado: () => void
  onExportarExcel: () => void
}

// RightDrawer.tsx
interface RightDrawerProps {
  isOpen: boolean
  onClose: () => void
  titulo: string
  children: ReactNode
}
```

**Nota crítica**: Todos los `data-testid` existentes (`tab-transacciones`, `tab-presupuesto`, `tab-simulador`, `tab-presupuesto-mejorado`, `tab-resultados`, `perfil-activo-chip`, `boton-toggle-modo-mejorado`) se preservan en los componentes nuevos SIN modificación. El `SelectorPerfil` sigue renderizándose como overlay `fixed inset-0 z-50` FUERA del `DashboardLayout`.

## Estrategia Responsiva

| Breakpoint | Sidebar | MainStage | RightDrawer |
|------------|---------|-----------|-------------|
| `>= lg` (1024px+) | `w-64 relative` | `flex-1` | `w-80 relative` (inline) |
| `< lg` | `w-64 relative` | `flex-1` | `fixed inset-y-0 right-0 w-80 z-40` (overlay) + backdrop |

El `RightDrawer` usa `lg:relative lg:translate-x-0` cuando está abierto en desktop y `fixed right-0 translate-x-0` / `translate-x-full` en viewports reducidos. La transición es `transition-transform duration-200`.

## Estrategia de Pruebas

| Capa | Qué Probar | Enfoque |
|------|------------|---------|
| Unit | Sidebar renderiza tabs con data-testid correctos | Vitest + RTL, verificar presencia de botones |
| Unit | RightDrawer toggle open/close | Vitest + RTL, verificar visibilidad condicional |
| Unit | DashboardLayout renderiza 3 slots | Vitest + RTL, verificar children en posición correcta |
| Integration | Los 169 tests existentes en App.test.tsx pasan sin cambios | `npm test` — regresión cero |

## Threat Matrix

N/A — no hay routing, shell, subprocess, VCS/PR automation, clasificación de ejecutables, ni integración de procesos.

## Migración / Rollout

No se requiere migración. Cambio visual puro — sin datos persistidos afectados. Rollback: revertir commit.

## Preguntas Abiertas

- Ninguna.
