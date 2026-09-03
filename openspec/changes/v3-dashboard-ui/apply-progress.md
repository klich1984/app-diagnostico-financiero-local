# Progreso de Implementación: v3-dashboard-ui

**Fecha**: 2026-09-03
**Modo**: Standard (sin Strict TDD — Phase 1 es configuración pura, sin lógica de componentes)
**Unidad de trabajo actual**: Phase 1 — Fundaciones y Configuración Visual

---

## Tareas completadas

- [x] **1.1** Configurar paleta Salmón (`salmon: '#f05454'`) y tipografía Raleway en `tailwind.config.js`.
- [x] **1.2** Agregar imports de fuentes Raleway, estilos base Dark Mode (`bg-zinc-950`) y regla utilitaria `tabular-nums` en `src/index.css`.

## Tareas pendientes

- [ ] 2.1 Crear `src/components/templates/DashboardLayout.tsx`
- [ ] 2.2 Crear tests unitarios en `src/components/templates/__tests__/DashboardLayout.test.tsx`
- [ ] 2.3 Crear `src/components/organisms/Sidebar.tsx`
- [ ] 2.4 Crear tests unitarios en `src/components/organisms/__tests__/Sidebar.test.tsx`
- [ ] 2.5 Crear `src/components/organisms/RightDrawer.tsx`
- [ ] 2.6 Crear tests unitarios en `src/components/organisms/__tests__/RightDrawer.test.tsx`
- [ ] 3.1 Declarar estado `drawerOpen` y orquestar `DashboardLayout` en `src/App.tsx`
- [ ] 3.2 Conectar `TransaccionForm` dentro del slot `drawer` en `src/App.tsx`
- [ ] 3.3 Mapear vistas centrales en el slot `main` de `src/App.tsx`
- [ ] 3.4 Asegurar que `SelectorPerfil` se renderice como overlay `fixed inset-0 z-50` en `src/App.tsx`
- [ ] 4.1 Ejecutar suite completa con `npm test` (169+ tests al 100%)
- [ ] 4.2 Validar consistencia de `tabular-nums` y ajuste 1080p sin scroll global

---

## Evidencia de la unidad de trabajo (Work Unit Evidence)

| Evidencia | Resultado |
|-----------|-----------|
| Comando de test enfocado | `npx vitest run src/data/__tests__/tauri-commands.test.ts` → 18/18 ✅ passed (43ms) |
| Runtime harness | `N/A` — Phase 1 solo modifica configuración CSS/Tailwind; ningún componente o ruta de ejecución es afectada |
| Límite de rollback | Revertir `tailwind.config.js` y `src/index.css` a su estado anterior (git revert del commit de Phase 1). Ningún otro archivo fue modificado. |

### Nota sobre el runner completo

`npm test` (vitest run sin filtros) termina con un crash del worker Tinypool en el contexto CI/jsdom de este entorno. Este fallo es pre-existente y no relacionado con Phase 1: los archivos modificados (`tailwind.config.js`, `src/index.css`) no son importados por ningún test file. Confirmado con `grep` sobre el árbol `src/**/*.test.*`.

---

## Archivos modificados

| Archivo | Acción | Descripción |
|---------|--------|-------------|
| `tailwind.config.js` | Modificado | Paleta `salmon` con escala completa (50–900, DEFAULT = `#f05454`) + `fontFamily.sans` → Raleway |
| `src/index.css` | Modificado | Import Google Fonts Raleway (400/500/600/700 + itálica); `@layer base` con `bg-zinc-950 text-slate-200 font-sans antialiased` y `font-variant-numeric: tabular-nums` en body; `@layer utilities` con alias `.tabular-nums` |

---

## Presupuesto de revisión

- **Líneas cambiadas**: +41 / -1 (41 líneas totales)
- **Riesgo presupuesto 400 líneas**: Muy bajo
- **Modo de entrega**: Single PR
- **Límite de la unidad**: Phase 1 completa — inicia desde archivos de configuración vacíos, termina con fundaciones visuales listas para Phase 2

---

## Desviaciones del diseño

Ninguna — la implementación coincide exactamente con las decisiones del `design.md`:
- `tailwind.config.js` extendido con `salmon` y `fontFamily.sans → Raleway` ✅
- `src/index.css` con import Raleway, `bg-zinc-950`, `tabular-nums` ✅

---

## Estado

**2/12 tareas completadas** (Phase 1: 2/2). Listo para Phase 2 (componentes de presentación).
