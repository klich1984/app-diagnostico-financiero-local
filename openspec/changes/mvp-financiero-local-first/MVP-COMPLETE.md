# Estado actual del MVP: Diagnóstico Financiero Local-First

> **Snapshot del cambio SDD `mvp-financiero-local-first`. NO es cierre formal.**
> Fecha del snapshot: **2026-07-24**.
> Estado del cambio: **ABIERTO** — el MVP aún tiene pendientes antes de poder cerrarse.
> Working tree: `main` en `67f97c7` (Slice 14 mergeado y pusheado).
> Documento anterior fechado 2026-07-04 refleja el estado al cierre del slice 9; este snapshot lo corrige con datos verificados al 2026-07-24.

---

## Section A — Resumen ejecutivo

### ¿Qué es la app?

Una aplicación de escritorio **local-first** que replica, con fidelidad al centavo, el motor de cálculo financiero del Excel de diagnóstico personal. El usuario introduce sus ingresos y gastos una vez, con sus frecuencias reales (Mensual, Bimensual, Trimestral, Semestral, Anual), y la app calcula automáticamente todos los agregados: presupuesto mensual, presupuesto anual, Flujo de Caja Libre, Flujo de Ahorro 1, Flujo de Ahorro 2 y Capacidad de Inversión. La pieza diferencial es el **Simulador de Oportunidades**: un panel interactivo donde el usuario propone nuevos montos mensuales para sus gastos no esenciales y ve cómo cambian su flujo y su capacidad de ahorro.

### ¿Qué problema resuelve?

El usuario opera hoy un Excel de 5 hojas, ~5,300 celdas activas y ~4,700 fórmulas, donde la fuente de verdad es `MIS FINANZAS` y todas las demás hojas son agregaciones `SUMIFS` que dependen de columnas espejo calculadas a mano. Esta arquitectura arrastra tres problemas: **fragilidad ante edición** (cambiar una frecuencia desincroniza el modelo entero sin señal de error), **imposibilidad de simular sin destruir datos** (el panel de simulación vive en la misma planilla que los datos reales) y **precisión flotante del entorno** (acumulación de decimales binarios que un frontend sin disciplina matemática no replicaría al centavo).

### Decisión técnica clave

La combinación **Tauri v2 (Rust) + React 18 + TypeScript + SQLite + `decimal.js`** entrega: bundle ~96% más chico que Electron, aritmética decimal exacta sin drift, persistencia en `INTEGER` (centavos Int64) con `CHECK constraints` para enums, y separación limpia entre datos reales y simulados. Todo el cómputo ocurre en el dispositivo del usuario: no hay servidor, no hay nube, no hay telemetría.

---

## Métricas del snapshot

| Métrica                                        | Valor                                                       |
| ---------------------------------------------- | ----------------------------------------------------------- |
| Total tests passing                            | **206** (137 frontend + 69 backend)                         |
| Slices completados (lógica + UI)               | **14 de 14**                                                |
| Commits mergeados en `main`                    | ver `git log --oneline`                                     |
| Golden values validados contra el Excel fuente | **7** (sin cambios desde el cierre del slice 9)             |
| Warnings conocidas remanentes                  | **1** (deferred, ver abajo)                                 |
| REQs cubiertos en `spec.md`                    | 19 / 19 (100%)                                              |
| HUs cubiertas del PRD                          | 14 / 14 (100% lógica); 13 / 14 con UI integrada             |
| Decisiones de producto locked cubiertas        | 6 / 6 (100%)                                                |
| Tabs implementadas vs planeadas en el PRD      | **4 de 5** (falta "Presupuesto Mejorado" como tab separada) |

> ⚠️ **Nota sobre los conteos del doc anterior:** el `MVP-COMPLETE.md` fechado 2026-07-04 decía "127 tests (74 FE + 53 BE)". Ese número correspondía al cierre del slice 9. Al 2026-07-24 hay **206 tests** porque se agregaron MatrizPresupuesto, DistribucionChart, EstadoResultadosPanel, SimuladorPanel y sus tests asociados en los slices 10-14.

### Golden values verificados al centavo

Estos son los 7 valores contra los que los golden tests comparan el motor (sin cambios desde el cierre del slice 9):

| #   | Métrica                           | Valor reportado  | Fuente Excel                       |
| --- | --------------------------------- | ---------------- | ---------------------------------- |
| 1   | Total Ingresos Mensual            | `$7,200,000.00`  | `PRESUPUESTO!F12`                  |
| 2   | Total Gastos Mensual              | `$8,345,000.00`  | `PRESUPUESTO!F24`                  |
| 3   | Flujo de Caja Libre (FA1)         | `$2,140,000.00`  | `ESTADO DE RESULTADOS!D14`         |
| 4   | Flujo de Ahorro 2 (Inicial)       | `-$1,145,000.00` | `ESTADO DE RESULTADOS!D21`         |
| 5   | Flujo de Ahorro 2 (Mejorado)      | `$425,000.00`    | `ESTADO DE RESULTADOS!H21`         |
| 6   | Capacidad de Inversión (Mejorado) | `$925,000.00`    | `ESTADO DE RESULTADOS!H23`         |
| 7   | Ahorro anual total del simulador  | `$24,840,000.00` | `PRESUPUESTO MEJORADO!F32` (anual) |

Todos los valores cierran al centavo (tolerancia `$0.00`) en el golden test de las 32 transacciones del Excel.

### Warnings remanentes

⚠️ **1 warning conocido (deferred):** deprecación de `ReactDOMTestUtils.act` en el archivo de test `src/components/molecules/__tests__/TransaccionForm.test.tsx`. La API `act` importada desde `react-dom/test-utils` está marcada deprecated en React 18; debe migrarse a `act` desde `@testing-library/react` o directamente desde `react`. **No bloquea** — el test pasa — pero queda registrado para housekeeping.

---

## Stack final

Las 6 decisiones locked del MVP reproducidas desde `openspec/changes/mvp-financiero-local-first/proposal.md` §3:

| #   | Decisión                                     | Implementación                                                                                                                                                  |
| --- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Idioma de la UI**                          | Español neutro LATAM sin voseo, formalidad "tú", sin selector de locale en v1.                                                                                  |
| 2   | **Salario Personal Objetivo en FA2 inicial** | NO se descuenta al inicio. Replica exacta del Excel: `-$1,145,000`. El salario descuenta solo en "Mejorado".                                                    |
| 3   | **Librería de gráficos**                     | Recharts (SVG-based, declarativo, ~100KB gzipped).                                                                                                              |
| 4   | **Validación de enums**                      | CHECK constraints en SQL dentro de `src-tauri/migrations/001_inicial.sql`.                                                                                      |
| 5   | **Límite duro de transacciones**             | Sin límite duro. Scroll virtualizado / paginación queda diferido (ver "Fuera del MVP").                                                                         |
| 6   | **Soporte multi-usuario**                    | Múltiples perfiles con selector. Tabla `Usuarios` ya creada. **UI del selector implementada en slice 14.** Modal de edición de salario objetivo sigue diferido. |

---

## Cobertura por épica (snapshot 2026-07-24)

| Épica       | Nombre                                 | Estado UI  | HUs cubiertas con UI                                       | REQs cubiertos                      | Tests que la cubren                                                                                                                                                                               |
| ----------- | -------------------------------------- | ---------- | ---------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ÉPICA 1** | Arquitectura de persistencia y puentes | ✅ Done    | HU-101, HU-102, HU-103                                     | REQ-101, REQ-102, REQ-103           | `migrations_test.rs`, `db_path_test.rs`, `sql_plugin_test.rs`, `capabilities_test.rs`, `smoke.test.ts`                                                                                            |
| **ÉPICA 2** | Captura transaccional y CRUD           | ✅ Done    | HU-201, HU-202, HU-203                                     | REQ-201, REQ-202, REQ-203           | `money-form.test.ts`, `normalizacion/index.test.ts`, `categorias_seed_test.rs`, `transacciones_repo_test.rs`, `TransaccionForm.test.tsx`, `ListaTransacciones.test.tsx` (con warning deprecation) |
| **ÉPICA 3** | Dashboard y Presupuesto                | ✅ Done    | HU-301, HU-302                                             | REQ-301, REQ-302                    | `agregaciones/matriz.test.ts`, `agregaciones/graficos.test.ts`, `MatrizPresupuesto.test.tsx`, `DistribucionChart.test.tsx`                                                                        |
| **ÉPICA 4** | Simulador de Oportunidades             | ✅ Done    | HU-401, HU-402, HU-403                                     | REQ-401, REQ-402, REQ-403           | `simulador/filtro.test.ts`, `simulador/debounce.test.ts`, `simulador/matriz-mejorada.test.ts`, `simulador_repo_test.rs`, `SimuladorPanel.test.tsx`                                                |
| **ÉPICA 5** | Estado de Resultados y métricas        | 🟡 Parcial | HU-501 ✅; **HU-502 falta modal UI para salario objetivo** | REQ-501, REQ-502 + REQ-605 (golden) | `kpis/index.test.ts`, `kpis/golden-excel.test.ts`, `kpis_test.rs`, `transacciones_aggregate_test.rs`, `EstadoResultadosPanel.test.tsx`                                                            |

> **Diferencia con el doc anterior (2026-07-04):** Épica 2, 3 y 5 cambiaron de 🟡 Partial a ✅ Done en UI (salvo Épica 5 / HU-502 que sigue parcial por el modal). Las páginas se implementaron como `organisms` wireados en `App.tsx` con state local (4 tabs), no como carpeta `src/pages/` separada — ver "Decisiones arquitectónicas implícitas" abajo.

---

## Decisiones arquitectónicas implícitas (no documentadas antes)

Durante los slices 10-14 se tomaron dos decisiones que conviene registrar formalmente:

1. **Organisms, no `pages/`:** la integración UI se hizo como `src/components/organisms/*` directamente wireados en `App.tsx`, sin crear la carpeta `src/pages/`. Esto es coherente con la simplicidad del routing (4 tabs locales sin React Router), pero contradice el comentario del doc anterior que hablaba de "queda diferido en `pages/`". La consecuencia es que **si en el futuro se quiere migrar a React Router**, hay que extraer las sub-UI de `App.tsx` a `pages/` primero.

2. **4 tabs en lugar de 5:** el PRD original menciona 5 pestañas (Mis Finanzas, Presupuesto, Oportunidades de Mejora, Presupuesto Mejorado, Estado de Resultados). La implementación consolidó en 4 (Transacciones, Presupuesto, Simulador, Resultados). "Presupuesto Mejorado" no existe como tab separada — la lógica de matriz mejorada está en el engine pero el render del presupuesto mejorado convive con la tab Simulador. **Esto es un delta contra el PRD**, no un bug: el comportamiento es accesible, solo cambia la navegación.

---

## Pendiente antes del cierre formal del cambio

Estos puntos bloquean el cierre formal del cambio SDD `mvp-financiero-local-first`:

| #   | Pendiente                                                                                                                                         | Esfuerzo estimado          | Bloqueante cierre |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ----------------- |
| 1   | **Modal UI para configurar salario objetivo personal** (HU-502): hoy solo editable por DB.                                                        | 1 slice chico              | Sí                |
| 2   | **Decidir sobre la 5ª tab "Presupuesto Mejorado"**: ¿se agrega tab separada o se documenta la consolidación con Simulador como decisión de scope? | decisión + posible 1 slice | Sí                |
| 3   | **Migrar `ReactDOMTestUtils.act` → `@testing-library/react`** en `TransaccionForm.test.tsx`                                                       | 15 min                     | No (housekeeping) |
| 4   | **Auditoría de accesibilidad WCAG AA** (declarada diferida en el doc anterior)                                                                    | 1+ slice                   | No (post-MVP)     |

Si se completan los puntos 1 y 2 (y se decide cómo se cierra la disyuntiva de la 5ª tab), el cambio SDD queda en condiciones de correr `/sdd-archive-stableopencode` para sincronizar los delta specs.

---

## Lo que está fuera del MVP

Estos elementos **no** se implementaron en este cambio. Quedan registrados para iteraciones futuras:

- **Multi-currency / multi-moneda**: la columna `moneda` está reservada pero deshabilitada. Single currency (LOCAL) en v1.
- **Cloud sync / multi-device**: ninguna integración en la nube. Single device, single `BaseDirectory::App`.
- **Dark mode / tema oscuro**.
- **Exportación a Excel / PDF / CSV**: la app solo lee datos, no exporta.
- **Open Finance / integración con bancos**: no en roadmap.
- **Notificaciones push, recordatorios o automatización**: no en scope.
- **Scroll virtualizado / paginación del listado de transacciones**: el doc original lo declara deferido; sigue vigente si la lista crece más allá de ~100 filas.

---

## Cómo correr el MVP

Asumiendo Node 18+, pnpm 11+, Rust stable 1.77+ y Windows 10/11 con WebView2 preinstalado.

```bash
# 1) Instalar dependencias (frontend + tooling)
pnpm install

# 2) Si pnpm pregunta por builds nativos aprobados:
pnpm approve-builds esbuild

# 3) Arrancar la app (boots Tauri window)
pnpm tauri dev
# En Windows, si cargo no está en PATH, usar el wrapper:
#   scripts\tauri-dev.cmd

# 4) Correr los tests del frontend (Vitest, 137 tests)
pnpm test
pnpm test:watch   # modo watch para iterar

# 5) Correr los tests del backend (cargo test, 69 tests)
cd src-tauri && cargo test
cd ..            # volver a la raíz

# 6) Verificar formato (Prettier + rustfmt si está configurado)
pnpm format:check

# 7) Auto-formatear archivos que fallen el check
pnpm format

# 8) Build de producción (instalador .msi en Windows)
pnpm tauri build
```

**Resultado esperado:** los comandos `pnpm test` y `cargo test` corren **206 tests verdes, 0 fallando**.

---

## Section B — Release notes por historia de usuario

> Las HUs vienen del PRD original (`docs/MVP-Financiero-Local_ Tecnologías-y-SCRUM.md`) y se trazan contra los REQs formales en `openspec/changes/mvp-financiero-local-first/spec.md`.

### ÉPICA 1 — Arquitectura de persistencia y puentes

#### HU-101 — Inicialización del entorno Tauri-React

- **Status:** ✅ Done
- **REQs cubiertos:** REQ-101
- **Archivos que lo implementan:**
  - `src-tauri/src/lib.rs` — entry point del binario Tauri.
  - `src-tauri/tauri.conf.json` — configuración del bundle.
  - `src-tauri/Cargo.toml` — dependencias Rust base.
  - `src-tauri/capabilities/default.json` — capability inicial (`core:default` únicamente).
  - `src/App.tsx`, `src/main.tsx` — entry points del frontend React.
  - `vite.config.ts`, `tailwind.config.js`, `postcss.config.js` — toolchain frontend.
  - `package.json` — dependencias npm (incluye `decimal.js`, `recharts`).
- **Tests que lo cubren:**
  - `src/__tests__/smoke.test.ts` — smoke test del frontend.
  - Verificación manual: `cargo tauri dev` arranca sin error.
- **Resumen:** la app compila con `cargo tauri dev`, el IPC del WebView está aislado por capacidades (solo `core:default` al inicio; `sql:default`, `sql:allow-execute`, `sql:allow-select` se agregan en HU-102), y las librerías `decimal.js` y TailwindCSS están instaladas y operativas.

#### HU-102 — Integración del bridge SQLite

- **Status:** ✅ Done
- **REQs cubiertos:** REQ-102
- **Archivos que lo implementan:**
  - `src-tauri/src/path.rs` — resolución del path DB en `BaseDirectory::App`.
  - `src-tauri/src/plugin.rs` — registro del plugin SQL.
  - `src-tauri/capabilities/default.json` — capabilities `sql:default`, `sql:allow-execute`, `sql:allow-select`.
  - `src-tauri/Cargo.toml` — features `rusqlite`, `sha2`.
- **Tests que lo cubren:**
  - `src-tauri/tests/sql_plugin_test.rs` — verifica que el plugin se carga.
  - `src-tauri/tests/db_path_test.rs` — verifica la resolución del path.
  - `src-tauri/tests/capabilities_test.rs` — verifica la configuración de capabilities.
- **Resumen:** la app carga `Database.load("sqlite:misfinanzas.db")`, el archivo se crea dentro de `BaseDirectory::App` del Tauri, y las 3 operations SQL están habilitadas vía capability file.

#### HU-103 — Migraciones versionadas y esquema inicial

- **Status:** ✅ Done
- **REQs cubiertos:** REQ-103, REQ-602
- **Archivos que lo implementan:**
  - `src-tauri/migrations/001_inicial.sql` — DDL con las 4 tablas (`Usuarios`, `Categorias`, `Transacciones`, `Simulador`) + tabla `_migrations`.
  - `src-tauri/src/migrations.rs` — runner de migraciones con `MigrationKind::Up`.
- **Tests que lo cubren:**
  - `src-tauri/tests/migrations_test.rs` — verifica creación de tablas, tipos `INTEGER` para montos y CHECK constraints para enums.
- **Resumen:** las 4 tablas se crean en el primer arranque, los montos se almacenan como `INTEGER` (centavos Int64), y los enums (`frecuencia`, `naturaleza_necesidad`, `comportamiento`, `tipo_flujo`) se validan a nivel SQL.

---

### ÉPICA 2 — Captura transaccional y CRUD

#### HU-201 — Sembrado de metadatos maestros (Categorías)

- **Status:** ✅ Done (lógica, seeds y dropdown dependiente)
- **REQs cubiertos:** REQ-201
- **Archivos que lo implementan:**
  - `src-tauri/src/seeds.rs` — seed de las 13 categorías al primer arranque.
  - `src/components/molecules/TransaccionForm.tsx` — wiring del dropdown dependiente por `tipo_flujo`.
- **Tests que lo cubren:**
  - `src-tauri/tests/categorias_seed_test.rs` — verifica que las 13 categorías están presentes tras el seed.
- **Resumen:** las 13 categorías se insertan automáticamente; el dropdown dependiente por `tipo_flujo` está cableado en `TransaccionForm` y se hidrata desde la DB al arrancar la app.

#### HU-202 — Captura interactiva de flujos (CRUD)

- **Status:** ✅ Done (ciclo CRUD + integración UI)
- **REQs cubiertos:** REQ-202
- **Archivos que lo implementan:**
  - `src-tauri/src/transacciones/repo.rs` — operaciones `insert`, `list`, `update`, `delete`.
  - `src-tauri/src/transacciones/mod.rs` — exports y tipos.
  - `src/data/tauri-commands.ts` — wrapper `invoke('cmd_insert_transaccion', ...)` (IPC real en runtime).
  - `src/domain/precision/money.ts` — helpers de formateo (input → centavos, centavos → display con separadores `.`).
  - `src/components/molecules/TransaccionForm.tsx` — molecule de captura con inputs numéricos formateados.
  - `src/components/organisms/ListaTransacciones.tsx` — listado interactivo con delete + form reset via `key` prop.
- **Tests que lo cubren:**
  - `src-tauri/tests/transacciones_repo_test.rs` — ciclo CRUD contra SQLite real.
  - `src/domain/precision/__tests__/money-form.test.ts` — formateo y parsing de strings `"1.500.000"` → `1500000`.
  - `src/components/molecules/__tests__/TransaccionForm.test.tsx` — render + interacción del form (con warning deprecation documentado).
  - `src/components/organisms/__tests__/ListaTransacciones.test.tsx` — render + delete + state reset.
- **Resumen:** el ciclo CRUD completo contra `Transacciones` está verde: `insertar`/`listar`/`actualizar`/`eliminar` persisten en SQLite, el formateo de inputs maneja separadores `.` para moneda, el listado se rehidrata después de cada mutación, y `TransaccionForm` se resetea vía `key` prop al volver a la tab. **Cambió desde el doc anterior (2026-07-04):** la integración UI ya está hecha (era "🟡 Partial" en el doc viejo).

#### HU-203 — Normalización temporal (frecuencias)

- **Status:** ✅ Done
- **REQs cubiertos:** REQ-203
- **Archivos que lo implementan:**
  - `src/domain/normalizacion/index.ts` — engine puro con los 5 divisores (`Mensual=1`, `Bimensual=2`, `Trimestral=3`, `Semestral=6`, `Anual=12`) y anualización `×12`.
- **Tests que lo cubren:**
  - `src/domain/normalizacion/__tests__/index.test.ts` — cubre los 5 escenarios de la spec (Mensual, Bimensual, Trimestral, Semestral, Anual) y la anualización.
- **Resumen:** cada transacción tiene su `valor_mensual` derivado en RAM y `valor_anual` derivado mediante `×12`, todo con `decimal.js` para evitar drift en acumulados trimestrales como `1,166,666.667`.

---

### ÉPICA 3 — Dashboard y Presupuesto

#### HU-301 — Matriz SUMIFS virtual

- **Status:** ✅ Done (lógica + render UI en tab Presupuesto)
- **REQs cubiertos:** REQ-301, REQ-605 (parte de la matriz)
- **Archivos que lo implementan:**
  - `src/domain/agregaciones/matriz.ts` — agrega por categoría × naturaleza/comportamiento, replica `PRESUPUESTO!C8:J24`.
  - `src/domain/agregaciones/index.ts` — entry point del módulo.
  - `src/components/organisms/MatrizPresupuesto.tsx` — organism que renderiza la matriz.
  - `src-tauri/src/transacciones/repo.rs` — lectura `list` que alimenta la matriz.
- **Tests que lo cubren:**
  - `src/domain/agregaciones/__tests__/matriz.test.ts` — verifica los totales `7,200,000.00` ingresos y `8,345,000.00` gastos.
  - `src/domain/agregaciones/__tests__/golden-mvp.test.ts` — golden test del dataset completo.
  - `src-tauri/tests/transacciones_aggregate_test.rs` — agregaciones desde el backend.
  - `src/components/organisms/__tests__/MatrizPresupuesto.test.tsx` — render del organism.
- **Resumen:** la matriz cruza categoría × naturaleza y subtotaliza correctamente sobre el dataset de 32 transacciones. Los 4 valores `Total Ingresos = 7,200,000`, `Necesario = 5,060,000`, `No tan necesario = 1,665,000`, `No necesario = 1,620,000` cierran al centavo. **Cambió desde el doc anterior (2026-07-04):** el render está implementado como organism wireado en la tab Presupuesto; el comentario sobre "queda diferida en `pages/`" del doc viejo era incorrecto.

#### HU-302 — Gráficos de distribución porcentual (Recharts)

- **Status:** ✅ Done (cálculo + render con Recharts en tab Presupuesto)
- **REQs cubiertos:** REQ-302
- **Archivos que lo implementan:**
  - `src/domain/agregaciones/graficos.ts` — calcula `%` sobre el total y arma payloads para Recharts.
  - `src/components/organisms/DistribucionChart.tsx` — PieChart de Recharts (ingresos y gastos, render lado a lado).
  - `package.json` — dependencia `recharts`.
- **Tests que lo cubren:**
  - `src/domain/agregaciones/__tests__/graficos.test.ts` — verifica los porcentajes por categoría.
  - `src/components/organisms/__tests__/DistribucionChart.test.tsx` — render del chart con payload.
- **Resumen:** la función de distribución porcentual devuelve datos listos para Recharts; dos PieCharts (Ingresos + Gastos) se renderizan en la tab Presupuesto vía `App.tsx:585-590`. **Cambió desde el doc anterior (2026-07-04):** el render visual está hecho.

---

### ÉPICA 4 — Simulador de Oportunidades

#### HU-401 — Filtro aislante de no esenciales

- **Status:** ✅ Done
- **REQs cubiertos:** REQ-401
- **Archivos que lo implementan:**
  - `src/domain/simulador/filtro.ts` — filtra por `naturaleza_necesidad ∈ {No necesario, No tan necesario}`.
- **Tests que lo cubren:**
  - `src/domain/simulador/__tests__/filtro.test.ts` — verifica que devuelve exactamente las 12 transacciones esperadas (Internet, Restaurantes, Centro comercial, Juguetes perritos, Domicilios, Plan de datos, Seguro carro, Gimnasio, Streaming, Taxi/Uber/Bus, Viajes, Ropa).
- **Resumen:** el filtro aísla correctamente las 12 transacciones no esenciales sobre el dataset de 32; gastos `Necesario` quedan fuera de la lista del simulador.

#### HU-402 — Recálculo en vivo con persistencia explícita

- **Status:** ✅ Done (recálculo + persistencia con botón Aplicar explícito en slice 12)
- **REQs cubiertos:** REQ-402
- **Archivos que lo implementan:**
  - `src/components/organisms/SimuladorPanel.tsx` — UI con inputs por categoría no esencial + botón "Aplicar".
  - `src-tauri/src/simulador/repo.rs` — operaciones `INSERT OR REPLACE` sobre la tabla `Simulador`.
- **Tests que lo cubren:**
  - `src-tauri/tests/simulador_repo_test.rs` — verifica upsert contra SQLite.
  - `src/components/organisms/__tests__/SimuladorPanel.test.tsx` — render + aplicar.
- **Resumen:** el usuario edita los montos propuestos en cada input no esencial y al hacer click en "Aplicar" se persisten en `Simulador` con `INSERT OR REPLACE`. Los KPIs (Total Gastos Variables, Ahorro Año, Flujos) se recalculan sobre los nuevos valores. **Cambió desde el doc anterior (2026-07-04):** se reemplazó el debounce implícito por un botón Aplicar explícito (decisión del slice 12) para evitar escrituras fantasma y dar al usuario control sobre cuándo persistir.

#### HU-403 — Matriz mejorada (left join + reemplazo)

- **Status:** ✅ Done
- **REQs cubiertos:** REQ-403, REQ-605 (parte de la matriz mejorada)
- **Archivos que lo implementan:**
  - `src/domain/simulador/matriz-mejorada.ts` — left join entre `Transacciones` y `Simulador`, gastos fijos e ingresos inmutables.
- **Tests que lo cubren:**
  - `src/domain/simulador/__tests__/matriz-mejorada.test.ts` — **golden test** que verifica el total `6,275,000.00` de la matriz mejorada.
- **Resumen:** la matriz mejorada reemplaza solo los gastos no esenciales con el valor del simulador; los gastos fijos (`Necesario`) y los ingresos conservan su valor original. El total cierra al centavo contra `PRESUPUESTO MEJORADO!F24`.

---

### ÉPICA 5 — Estado de Resultados y métricas

#### HU-501 — Visualizador dual (Inicial vs Mejorado)

- **Status:** ✅ Done (engine + render UI en tab Resultados)
- **REQs cubiertos:** REQ-501, REQ-605 (golden state de resultados)
- **Archivos que lo implementan:**
  - `src/domain/kpis/index.ts` — engine puro del estado de resultados (FA1, FA2, Cap.Inv para ambos lados).
  - `src-tauri/src/kpis.rs` — re-implementación del engine en Rust para uso backend.
  - `src/components/organisms/EstadoResultadosPanel.tsx` — render UI con columnas Inicial, Delta, Mejorado.
- **Tests que lo cubren:**
  - `src/domain/kpis/__tests__/index.test.ts` — verifica los 6 valores del estado de resultados.
  - `src/domain/kpis/__tests__/golden-excel.test.ts` — **golden test** que compara contra `ESTADO DE RESULTADOS!D14/D21/D23` y `H14/H21/H23`.
  - `src-tauri/tests/kpis_test.rs` — verificación del engine Rust.
  - `src/components/organisms/__tests__/EstadoResultadosPanel.test.tsx` — render del panel.
- **Resumen:** el motor de estado de resultados replica al centavo los 6 valores del Excel:
  - Inicial: FA1=2,140,000.00 / FA2=-1,145,000.00 / Cap.Inv=-1,145,000.00
  - Mejorado: FA1=2,140,000.00 / FA2=425,000.00 / Cap.Inv=925,000.00
    La columna Delta muestra la diferencia entre Mejorado e Inicial. **Cambió desde el doc anterior (2026-07-04):** el render está implementado como organism wireado en la 4ª tab; el comentario sobre "`pages/EstadoResultados.tsx` queda diferida" del doc viejo era incorrecto.

#### HU-502 — Salario Personal Objetivo configurable

- **Status:** 🟡 Parcial (lógica + persistencia + lectura; **falta modal UI**)
- **REQs cubiertos:** REQ-502 (motor), REQ-502 (UI pendiente)
- **Archivos que lo implementan:**
  - `src/domain/kpis/index.ts` — resta el `salario_objetivo` solo en el lado "Mejorado".
  - `src-tauri/migrations/001_inicial.sql` — columna `salario_objetivo_centavos` en `Usuarios`.
  - `src/components/organisms/SelectorPerfil.tsx` — selector de perfil activo que hidrata `salario_objetivo_centavos` desde DB en `App.tsx`.
- **Tests que lo cubren:**
  - `src/domain/kpis/__tests__/index.test.ts` — verifica que el salario se resta solo en modo Mejorado.
  - `src/domain/kpis/__tests__/golden-excel.test.ts` — verifica el `Salario Personal Objetivo = 500,000.00` del golden.
- **Pendiente concreto:** **modal UI para editar el salario personal objetivo** sin tocar la DB. Hoy solo se cambia indirectamente vía `UPDATE` en SQLite. Esto es el último pendiente bloqueante del cambio SDD.

---

## Section C — Quick links

| Documento                                                                                                                      | Propósito                                                               |
| ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| [`spec.md`](./spec.md)                                                                                                         | Requisitos formales REQ-101 → REQ-605 con 38 escenarios                 |
| [`design.md`](./design.md)                                                                                                     | Diseño técnico y arquitectura (1688 líneas)                             |
| [`tasks.md`](./tasks.md)                                                                                                       | Task breakdown con el worklog de cada slice                             |
| [`proposal.md`](./proposal.md)                                                                                                 | Propuesta de cambio con las 6 decisiones locked                         |
| [`slice-2-test-plan.md`](./slice-2-test-plan.md)                                                                               | Plan de tests del slice 2 (SQLite + migrations)                         |
| [`slice-3-test-plan.md`](./slice-3-test-plan.md)                                                                               | Plan de tests del slice 3 (captura + normalización)                     |
| [`slice-4-test-plan.md`](./slice-4-test-plan.md)                                                                               | Plan de tests del slice 4 (matriz + gráficos)                           |
| [`slice-5-test-plan.md`](./slice-5-test-plan.md)                                                                               | Plan de tests del slice 5 (simulador)                                   |
| [`slice-6-test-plan.md`](./slice-6-test-plan.md)                                                                               | Plan de tests del slice 6 (KPIs + golden)                               |
| [`slice-13-test-plan.md`](./slice-13-test-plan.md)                                                                             | Plan de tests del slice 13 (distribution charts)                        |
| [`slice-14-test-plan.md`](./slice-14-test-plan.md)                                                                             | Plan de tests del slice 14 (estado de resultados dual)                  |
| [`slice-14-tasks.md`](./slice-14-tasks.md)                                                                                     | Task checklist del slice 14                                             |
| [`../../src/domain/simulador/__tests__/matriz-mejorada.test.ts`](../../src/domain/simulador/__tests__/matriz-mejorada.test.ts) | Golden test que valida `6,275,000.00` (REQ-403)                         |
| [`../../src/domain/kpis/__tests__/golden-excel.test.ts`](../../src/domain/kpis/__tests__/golden-excel.test.ts)                 | Golden test que valida los 6 valores del Estado de Resultados (REQ-605) |
