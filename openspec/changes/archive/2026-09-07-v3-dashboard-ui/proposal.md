# Propuesta: Rediseño Dashboard V3 (UI Flexbox 3 Columnas)

## Intención

Migrar la interfaz monolítica actual (tabs lineales con scroll vertical excesivo) a un layout de escritorio denso, modular y Dark Mode ("offline-first"), estructurado en 3 columnas (Sidebar, Main Stage, Right Drawer) según las directrices de `docs/DESIGN.md` y `docs/PRODUCT.md`.

## Alcance

### Dentro del alcance
- Layout Flexbox de 3 columnas (`DashboardLayout`) adaptado a viewport 1080p sin scroll global.
- Extracción y modularización de componentes atómicos: `Sidebar`, `RightDrawer` y `MainStage`.
- Aplicación de identidad visual V3: fondo `bg-zinc-950`/`bg-zinc-900`, acento Salmón (`#f05454`), bordes `border-white/10` y números tabulares (`tabular-nums`).
- Integración del formulario de transacciones en `RightDrawer` colapsable.
- Preservación íntegra de la reactividad y contratos de estado en `App.tsx` (o contexto derivado).

### Fuera del alcance
- Alteraciones al esquema SQLite o comandos IPC en Rust (`src-tauri`).
- Implementación de backend remoto o sincronización cloud.
- Reescritura del motor de cálculo financiero o KPIs.

## Capacidades

### Nuevas Capacidades
- `v3-dashboard-layout`: Layout de 3 columnas de alta densidad con Dark Mode nativo y navegación integrada.

### Capacidades Modificadas
- Ninguna.

## Enfoque

Implementar una arquitectura por componentes (`templates/` y `organisms/`) que distribuya la navegación en el `Sidebar` izquierdo, el análisis de datos (Matriz, Simulador, Resultados) en el `MainStage` central y la captura/edición en el `RightDrawer` derecho. Se estiliza con Tailwind CSS aplicando tokens oscuros profundos y alineación tabular estricta.

## Áreas Afectadas

| Área | Impacto | Descripción |
|------|---------|-------------|
| `src/components/templates/DashboardLayout.tsx` | Nuevo | Contenedor principal Flexbox de 3 columnas (1080p fit) |
| `src/components/organisms/Sidebar.tsx` | Nuevo | Navegación vertical, perfil activo, toggles y acciones globales |
| `src/components/organisms/RightDrawer.tsx` | Nuevo | Drawer lateral colapsable para captura y edición de transacciones |
| `src/App.tsx` | Modificado | Orquestación de vistas, estado activo y cableado de componentes |
| `src/index.css` | Modificado | Reglas de tipografía Raleway, variables Dark Mode y `tabular-nums` |

## Riesgos

| Riesgo | Probabilidad | Mitigación |
|------|------------|------------|
| Ruptura de tests de integración en `App.test.tsx` | Media | Mantener los `data-testid` existentes en los nuevos subcomponentes |
| Desbordamiento visual en pantallas < 1080p | Media | Configurar scrollbars internos independientes por columna |

## Plan de Reversión

Revertir los cambios en `src/App.tsx` y `src/index.css`, y eliminar los archivos nuevos en `src/components/templates/` y `src/components/organisms/`.

## Dependencias

- Tailwind CSS y Lucide React / Heroicons (si aplica para iconos de navegación).
- No requiere dependencias externas de runtime adicionales.

## Criterios de Éxito

- [ ] Layout visible de 3 columnas ajustado a viewport de escritorio sin scroll de página completa.
- [ ] Formularios de transacción operativos dentro del `RightDrawer`.
- [ ] Paleta `zinc-950` con acento `#f05454` y tipografía `tabular-nums` activa.
- [ ] Suite de pruebas (`npm test`) pasando al 100%.
