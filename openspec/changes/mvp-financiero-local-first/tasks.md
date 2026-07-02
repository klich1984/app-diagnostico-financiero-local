# Tareas: MVP Financiero Local-First

> Blueprint ejecutable para la fase `sdd-apply`. Cada tarea es atómica y tiene DOD verificable.

---

## A. Resumen de planificación

| Métrica                      | Valor               |
| ---------------------------- | ------------------- |
| Total de tareas              | 25                  |
| Diff total estimado (líneas) | 2.800 - 3.200       |
| PRs recomendados             | 6 slices            |
| Estrategia de chained PRs    | **stacked-to-main** |

### Recomendación de estrategia

Se recomienda **`stacked-to-main`** porque:

- Las 5 épicas son relativamente independientes en términos de arquitectura
- Cada slice entrega una demo verificable de extremo a extremo
- El rebase entre slices es simple: cada PR targets `main`
- Si un slice falla, los anteriores ya están mergeados y no se pierden

**Alternativa rechazada**: `feature-branch-chain` agregaría complejidad de rebase innecesaria para este proyecto.

---

## B. Convención de ramas y commits

### Patrón de nombres de rama

```
feat/ep{N}-{slug-epica}
feat/ep{N}-{slug-epica}-hu{NNN}
fix/{slug}
chore/{slug}
docs/{slug}
refactor/{slug}
test/{slug}
```

### Ejemplos de Conventional Commits por épica

**Épica 1 (Arquitectura):**

```text
feat(tauri): inicializar proyecto con Tauri v2 y React
feat(sql): configurar tauri-plugin-sql con SQLite embebido
feat(migraciones): ejecutar schema inicial v1 con CHECK constraints
chore(deps): instalar decimal.js, tailwindcss, zustand, recharts
```

**Épica 2 (Captura):**

```text
feat(categorias): sembrar 14 categorías iniciales en migración
feat(transacciones): crear formulario de captura con validación
feat(normalizacion): implementar motor de mensualización por frecuencia
feat(store): crear useTransaccionesStore con operaciones CRUD
```

**Épica 3 (Dashboard):**

```text
feat(presupuesto): calcular totales por categoría y naturaleza
feat(sumifs): replicar fórmulas SUMIFS del Excel en TypeScript
feat(graficos): integrar Recharts con distribución porcentual
```

**Épica 4 (Simulador):**

```text
feat(simulador): filtrar gastos no esenciales para simulación
feat(debounce): implementar input con espera de 300ms
feat(flush): persistir cambios al cerrar ventana con drain pattern
feat(presupuesto-mejorado): generar matriz con left join Simulador
```

**Épica 5 (Estado de Resultados):**

```text
feat(estado-resultados): mostrar vista dual inicial/mejorado
feat(salario-modal): configurar salario personal objetivo
feat(kpis): calcular FA1, FA2 y Capacidad Inversión
```

---

## C. Tareas por épica

### Épica 1: Arquitectura de Persistencia y Puentes

| ID    | HU     | REQs    | Título                                        | Descripción                                                                           | Archivos                                                       | Diff est. | Tests                           | Dependencias | DoD                                      |
| ----- | ------ | ------- | --------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------- | --------- | ------------------------------- | ------------ | ---------------------------------------- |
| T-101 | HU-101 | REQ-101 | Inicializar repositorio Git y estructura base | Crear estructura de carpetas según design.md, inicializar git, crear .gitignore       | Raíz del proyecto                                              | 50        | -                               | -            | Git inicializado, estructura visible     |
| T-102 | HU-101 | REQ-101 | Configurar Tauri v2 con React + Vite          | Ejecutar scaffolding de Tauri, verificar que `cargo tauri dev` abre ventana           | `src-tauri/`, `package.json`, `vite.config.ts`                 | 150       | `cargo build` pasa              | T-101        | App compila y abre WebView               |
| T-103 | HU-101 | REQ-101 | Instalar dependencias frontend                | Instalar decimal.js, tailwindcss, zustand, recharts, vitest                           | `package.json`, `src/`                                         | 80        | `pnpm install` + `pnpm build`   | T-102        | Dependencias en node_modules, build pasa |
| T-104 | HU-102 | REQ-102 | Integrar SQLite con tauri-plugin-sql          | Configurar plugin SQL, crear conexión, definir capabilities                           | `src-tauri/capabilities/default.json`, `src/db/connection.ts`  | 100       | `pnpm tauri dev` conecta SQLite | T-103        | DB se crea en %APPDATA%/mvp-fin          |
| T-105 | HU-103 | REQ-103 | Ejecutar migraciones y crear schema v1        | Escribir migration 001_inicial.sql con 5 tablas, CHECKs, índices, seed de categorías  | `src-tauri/src/db/migrations.rs`, `migrations/001_inicial.sql` | 200       | Tests de CHECK constraint       | T-104        | Tablas creadas, SELECT funciona          |
| T-106 | HU-103 | REQ-103 | Exponer comandos IPC Rust                     | Implementar comandos cmd_crear_usuario, cmd_listar_categorias, cmd_insert_transaccion | `src-tauri/src/commands/*.rs`                                  | 150       | `cargo test` comandos           | T-105        | Comandos responden correctamente         |

### Épica 2: Captura Transaccional y CRUD

| ID    | HU     | REQs    | Título                                       | Descripción                                                                   | Archivos                                       | Diff est. | Tests                     | Dependencias | DoD                                |
| ----- | ------ | ------- | -------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------- | --------- | ------------------------- | ------------ | ---------------------------------- |
| T-201 | HU-201 | REQ-201 | Verificar categorías sembradas               | Confirmar que las 14 categorías (10 gastos + 4 ingresos) existen en DB        | Query SQL directa                              | 20        | SELECT count = 14         | T-105        | 14 categorías visibles             |
| T-202 | HU-202 | REQ-202 | Crear formulario de captura de transacciones | Crear TransaccionForm.tsx con selects dependientes, input numérico formateado | `src/components/molecules/TransaccionForm.tsx` | 120       | Vitest renderizado        | T-106        | Formulario renderiza, acepta input |
| T-203 | HU-202 | REQ-202 | Crear useTransaccionesStore                  | Implementar store Zustand con cargar, insertar, actualizar, eliminar          | `src/stores/useTransaccionesStore.ts`          | 80        | Vitest store              | T-106        | Store guarda y recupera datos      |
| T-204 | HU-203 | REQ-203 | Implementar motor de normalización           | Crear src/domain/normalizacion/ con mensualizar() por frecuencia              | `src/domain/normalizacion/*.ts`                | 60        | Tests normalización       | -            | 5 escenarios de freq funcionando   |
| T-205 | HU-202 | REQ-202 | Conectar formulario a DB                     | Integrar TransaccionForm con useTransaccionesStore via IPC                    | Componente + store                             | 80        | E2E: insertar transacción | T-202, T-203 | Transacción persiste en DB         |

### Épica 3: Dashboard y Presupuesto

| ID    | HU     | REQs             | Título                                 | Descripción                                                     | Archivos                                            | Diff est. | Tests               | Dependencias | DoD                                |
| ----- | ------ | ---------------- | -------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------- | --------- | ------------------- | ------------ | ---------------------------------- |
| T-301 | HU-301 | REQ-301          | Crear usePresupuestoStore derivado     | Calcular totales por categoría y naturaleza desde transacciones | `src/stores/usePresupuestoStore.ts`                 | 60        | Vitest agregaciones | T-205        | Totales correctos con 32 tx        |
| T-302 | HU-301 | REQ-301          | Implementar matriz SUMIFS              | Replicar fórmulas SUMIFS del Excel en TypeScript                | `src/domain/agregaciones/sumifs.ts`                 | 80        | Tests contra Excel  | T-301        | Valores = Excel (7200000, 8345000) |
| T-303 | HU-302 | REQ-302          | Integrar Recharts para visualizaciones | Crear componentes de gráfico torta y barras con distribución    | `src/components/organisms/GraficosDistribucion.tsx` | 100       | Vitest render       | T-301        | Gráficos renderizan percentages    |
| T-304 | HU-302 | REQ-301, REQ-302 | Crear página de Presupuesto            | Montar MisFinanzasPage con tabla y gráficos                     | `src/components/pages/PresupuestoPage.tsx`          | 120       | E2E navegación      | T-302, T-303 | Página muestra dashboard completo  |

### Épica 4: Simulador de Oportunidades

| ID    | HU     | REQs             | Título                            | Descripción                                                          | Archivos                                       | Diff est. | Tests           | Dependencias | DoD                              |
| ----- | ------ | ---------------- | --------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------- | --------- | --------------- | ------------ | -------------------------------- |
| T-401 | HU-401 | REQ-401          | Filtrar gastos no esenciales      | Crear filtro para naturaleza No necesario / No tan necesario         | `src/domain/agregaciones/leftJoinSimulador.ts` | 40        | Tests filtro    | T-205        | 12 transacciones filtradas       |
| T-402 | HU-402 | REQ-402          | Input con debounce                | Implementar useDebounce para escritura en Simulador                  | `src/hooks/useDebounce.ts`                     | 30        | Vitest debounce | T-401        | Persistencia con 300ms delay     |
| T-403 | HU-402 | REQ-402          | Flush on close                    | Implementar drain pattern con beforeunload y tauri://close-requested | `src/hooks/useFlushOnClose.ts`                 | 60        | Test cierre     | T-402        | Cambios se guardan al cerrar     |
| T-404 | HU-403 | REQ-403          | Algoritmo de presupuesto mejorado | LEFT JOIN entre Transacciones y Simulador para generar presupuesto   | `src/domain/agregaciones/leftJoinSimulador.ts` | 80        | Tests left join | T-401        | Total = 6275000                  |
| T-405 | HU-401 | REQ-401, REQ-402 | Crear página Simulador            | Montar SimuladorPage conPanelSimulador y FilaSimulador               | `src/components/pages/SimuladorPage.tsx`       | 100       | E2E simulación  | T-403, T-404 | Usuario cambia valor y ve ahorro |

### Épica 5: Estado de Resultados y Métricas

| ID    | HU     | REQs             | Título                         | Descripción                                             | Archivos                                            | Diff est. | Tests         | Dependencias | DoD                                   |
| ----- | ------ | ---------------- | ------------------------------ | ------------------------------------------------------- | --------------------------------------------------- | --------- | ------------- | ------------ | ------------------------------------- |
| T-501 | HU-501 | REQ-501          | Vista dual Inicial vs Mejorado | Crear EstadoResultadosDual con dos columnas de KPIs     | `src/components/organisms/EstadoResultadosDual.tsx` | 80        | Vitest render | T-304        | Ambas vistas muestran valores         |
| T-502 | HU-502 | REQ-502          | Modal de salario objetivo      | Crear diálogo para configurar salario_personal_objetivo | `src/components/molecules/SalarioModal.tsx`         | 60        | Vitest modal  | T-501        | Salario se persiste y descuenta       |
| T-503 | HU-501 | REQ-501, REQ-502 | Calcular KPIs finales          | Implementar FA1, FA2, Cap.Inversión con y sin descuento | `src/domain/kpis/*.ts`                              | 80        | Tests KPIs    | T-502        | FA1=2140000, FA2=-1145000, Cap=925000 |

### Tareas Transversales

| ID    | HU  | REQs    | Título                   | Descripción                                            | Archivos                                                               | Diff est. | Tests              | Dependencias | DoD                       |
| ----- | --- | ------- | ------------------------ | ------------------------------------------------------ | ---------------------------------------------------------------------- | --------- | ------------------ | ------------ | ------------------------- |
| T-X01 | -   | REQ-605 | Golden tests fixture     | Crear 32_transacciones.json desde Excel, tests golden  | `scripts/fixtures/32_transacciones.json`, `src/tests/golden/*.test.ts` | 150       | vitest pasa golden | T-503        | 0 cents diff contra Excel |
| T-X02 | -   | REQ-605 | Script CI/local de tests | Crear script que corre cargo test + pnpm test en orden | `scripts/test-ci.ps1`                                                  | 30        | Script ejecutable  | T-X01        | Todos los tests pasan     |

---

## D. Orden de ejecución y dependencias

### Grafo de dependencias (textual)

```
T-101 ─► T-102 ─► T-103 ─► T-104 ─► T-105 ─► T-106
                                                    │
                                          ┌────────┴────────┐
                                          ▼                ▼
                                       T-201           T-204
                                          │                │
                                          ▼                ▼
                                       T-202 ◄──────── T-203
                                          │                │
                                          ▼                ▼
                                       T-205 ──────────────────────┐
                                                            │
                                          ┌────────────────┴────────────┐
                                          ▼                         ▼
                                       T-301                   T-401
                                          │                         │
                                          ▼                         ▼
                                       T-302 ◄──────────────── T-402
                                          │                         │
                                          ▼                         ▼
                                       T-303                   T-403
                                          │                         │
                                          ▼                         ▼
                                       T-304 ◄──────────────► T-404
                                          │                         │
                                          └──────────┬──────────────┘
                                                     │
                                                     ▼
                                                  T-405
                                                     │
                                                     ▼
                                                  T-501
                                                     │
                                                     ▼
                                                  T-502
                                                     │
                                                     ▼
                                                  T-503
                                                     │
                                                     ▼
                                                  T-X01
                                                     │
                                                     ▼
                                                  T-X02
```

### Definición de slices (PRs)

| Slice   | PR #  | Tareas                        | Demo verificable                                          |
| ------- | ----- | ----------------------------- | --------------------------------------------------------- |
| Slice 1 | PR #1 | T-101 → T-103                 | App boots, WebView muestra interfaz vacía                 |
| Slice 2 | PR #2 | T-104 → T-106 + T-201         | SQLite crea tablas, categorías sembradas, SELECT funciona |
| Slice 3 | PR #3 | T-202 → T-205                 | Usuario puede agregar transacción manualmente             |
| Slice 4 | PR #4 | T-301 → T-304                 | Dashboard con tabla y gráficos con las 32 transacciones   |
| Slice 5 | PR #5 | T-401 → T-405                 | Simulador permite cambiar gasto y ver ahorro              |
| Slice 6 | PR #6 | T-501 → T-503 + T-X01 + T-X02 | Estado resultados + golden tests pasan                    |

---

## E. Review Workload Forecast

| Métrica             | Valor                                               |
| ------------------- | --------------------------------------------------- |
| Diff total estimado | 2.800 - 3.200 líneas                                |
| Slice más grande    | PR #2 (T-104→T-106 + T-201): ~470 líneas            |
| Riesgo 400 líneas   | **Alto** - Slice 2 y Slice 4 exceden el presupuesto |

### Análisis por slice

| Slice | Tareas                            | Diff est. | Sobre 400?     | Acción recomendada                   |
| ----- | --------------------------------- | --------- | -------------- | ------------------------------------ |
| PR #1 | T-101, T-102, T-103               | ~280      | No             | Merge directo                        |
| PR #2 | T-104, T-105, T-106, T-201        | ~470      | **Sí**         | Requiere excepción de tamaño o split |
| PR #3 | T-202, T-203, T-204, T-205        | ~340      | No             | Merge directo                        |
| PR #4 | T-301, T-302, T-303, T-304        | ~360      | No             | Merge directo                        |
| PR #5 | T-401, T-402, T-403, T-404, T-405 | ~310      | No             | Merge directo                        |
| PR #6 | T-501, T-502, T-503, T-X01, T-X02 | ~400      | **Sí** (justo) | Verificar en implementación          |

### Decisión requerida antes de apply

**Decision needed before apply:** **Sí**

**Razonamiento:** Slice 2 excede las 400 líneas (470). Se recomienda:

1. **Opción A**: Aprobar `size:exception` para Slice 2 (justificado porque incluye schema SQL + seed + primeros comandos Rust, difícil de dividir sin perder coherencia)
2. **Opción B**: Dividir Slice 2 en dos: (T-104+T-105) y (T-106+T-201), pero esto rompe la demo coherente

**Chained PRs recommended:** Sí
**Chain strategy:** stacked-to-main
**400-line budget risk:** High (Slice 2), Medium (Slice 6)

---

## F. Riesgos de implementación

| Riesgo                                                              | Probabilidad | Impacto | Mitigación                                                                                                                               |
| ------------------------------------------------------------------- | ------------ | ------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| T-203 (normalización) debe estar lista antes de T-301 (presupuesto) | Alta         | Alto    | Son independientes en código, pero presupuesto depende lógicamente de los equivalentes mensuales. NO reordernar.                         |
| T-404 (left join) debe usar datos de T-205 y T-403                  | Media        | Alto    | Dependencia clara: no iniciar T-404 hasta que T-205 y T-403 estén mergeadas                                                              |
| Drift en anualización ×12 con decimales                             | Alta         | Medio   | decimal.js con precisión 28 y ROUND_HALF_EVEN. Tests golden contra Excel.                                                                |
| Flush on close puede perder datos si el timeout de 2s se agota      | Media        | Medio   | El diseño incluye timeout duro; si el usuario tiene muchas transacciones pendientes, puede perder algunas. Aceptar como riesgo conocido. |
| El diff de Slice 2 excede 400 líneas                                | Alta         | Medio   | Solicitar `size:exception` al usuario antes de apply                                                                                     |

---

## G. Definition of Done global

### DOD por tarea (específica)

- Código compilable (build pasa)
- Tests unitarios asociados pasan
- Prueba de integración manual completada por el usuario
- Conventional commit con scope en español

### DOD global del proyecto

- Las 14 HUs del PRD están implementadas
- Los 19 REQs del spec están cubiertos
- Los 38 escenarios de spec tienen tests o verificación manual
- Los golden tests pasan con 0 cents de diferencia contra Excel
- La aplicación compila con `cargo tauri build`
- El instalador .msi se genera correctamente
- No hay commits directos a main (todo en ramas)
- Conventional Commits en español neutro

### Criterios de aceptación del usuario (regla dura #4)

- El usuario revisa cada PR antes de merge
- El usuario corre `pnpm test` y `cargo test` localmente
- El usuario valida manualmente cada feature antes de aprobar la HU
- No hay auto-aprobación de fases

---

## Notas adicionales

1. **Idioma**: Todos los textos de UI, mensajes de commit y documentación en **español neutro** (sin voseo).
2. **Dependencias externas**: No se usa ninguna API externa. Todo es local-first.
3. **Multi-perfil**: El selector de perfil se implementa desde T-106 (comandos de usuario) y T-205 (transacciones filtradas por usuario_id).
4. **Sin límite de transacciones**: La UI implementa scroll/paginación si es necesario, pero el backend no limita.
5. **Precisión decimal**: Se usa decimal.js con ROUND_HALF_EVEN y precisión 28.
