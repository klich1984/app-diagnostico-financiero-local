# Tasks: MVP v2.1 Gap Analysis

> [!NOTE]
> Este feature (v2.1) implementa las mejoras de Gap Analysis detectadas contra el Excel original, específicamente colores de semáforo para KPIs y exportación en formato CSV. Varias mejoras (columna anual, simulador) ya fueron implementadas previamente.

## Estrategia de Git (Decisión de Workflow)

- **Tracker**: `feat/mvp-v2.1-gap-analysis`
- **Ramas hijas**: Cada slice se desarrolla en una rama hija apuntando al tracker (`--base feat/mvp-v2.1-gap-analysis`).
- **PR Tracker**: El PR del tracker v2.1 apuntando a `feat/mvp-v2-features` se creará **después** de mergear la primera rama hija (no como draft vacío).

## Slices Restantes

### Slice 1: Mejoras de UX Frontend (Semáforo KPIs)
- [x] **Modificar** `src/components/organisms/EstadoResultadosPanel.tsx`
  - Agregar lógica condicional para el color del semáforo en los KPIs (FA2 y Capacidad de Inversión).
  - Usar clases CSS: `text-red-500` si es `< 0`, `text-green-600` si es `>= 0`.

### Slice 2: Exportación CSV (2 Archivos)
> **Decisión UX**: Exportar `transacciones.csv` y `estado_resultados.csv` por separado, pero en una sola acción (pidiendo al usuario seleccionar un directorio destino).
- [ ] **Verificar** la lectura de la preferencia de `modo_mejorado_activo` desde SQLite en la inicialización (opcional/verificación).
- [ ] **Modificar** `src-tauri/Cargo.toml` y `src-tauri/tauri.conf.json` para activar dependencias `tauri-plugin-fs` y `tauri-plugin-dialog`.
- [ ] **Crear** `src/data/export-csv.ts` para manejar la lógica de transformación a CSV.
- [ ] **Integrar** botón de exportación en la UI que dispare el selector de directorios y guarde ambos archivos.
