# Diagnóstico Financiero Local-First

Aplicación de escritorio para gestión financiera personal construida con **Tauri v2 + React 18 + TypeScript**, con persistencia **local-first** en SQLite y cálculos precisos con `decimal.js`.

> Documentación funcional y arquitectónica: ver [`openspec/changes/mvp-financiero-local-first/`](openspec/changes/mvp-financiero-local-first/).
> Análisis de la plantilla financiera de origen: [`docs/analisis-plantilla-financiera.md`](docs/analisis-plantilla-financiera.md).

---

## Estado

**MVP con 14 Slices completados.** Cierre al centavo contra el Excel fuente. Ver [`MVP-COMPLETE.md`](openspec/changes/mvp-financiero-local-first/MVP-COMPLETE.md) para el resumen ejecutivo y las release notes por historia de usuario.

| Slices | PRs     | Tareas                                                         | Estado    |
| ------ | ------- | -------------------------------------------------------------- | --------- |
| 1–6    | #1–#6   | Lógica del motor (SQLite, captura, presupuesto, simulador, KPIs)| ✅ done  |
| 7–14   | #7–#14  | Integración UI completa (organismos, 4 pestañas, selector)     | ✅ done  |

**Tests:** 206 verde (137 frontend + 69 backend), 0 fallando.

---

## Stack

- **Frontend:** React 18 + TypeScript + Vite + TailwindCSS + `decimal.js`
- **Backend:** Tauri v2 (Rust) con `tauri-plugin-sql`
- **DB:** SQLite (centavos enteros, CHECK constraints para enums)
- **Gráficos:** Recharts
- **Tests:** Vitest (frontend) + `cargo test` (backend)

---

## Requisitos previos

- **Node.js 18+** y **pnpm 11+**
- **Rust** (stable, instalado vía [rustup](https://rustup.rs))
- **Windows**: WebView2 Runtime (preinstalado en Windows 11) y MSVC Build Tools

En Windows, después de instalar Rust con winget o rustup-init, **reiniciar la terminal** para que `cargo` esté en el `PATH` de la nueva shell. Si `pnpm tauri dev` falla con `program not found` para `cargo`, usar `scripts\tauri-dev.cmd` (wrapper que agrega `~/.cargo/bin` al `PATH`).

---

## Instalación

```bash
pnpm install
```

Si pnpm pregunta por builds nativos aprobados, ejecutar:

```bash
pnpm approve-builds esbuild
```

---

## Desarrollo

```bash
# Instalar dependencias
pnpm install

# Arrancar la app (boots Tauri window)
pnpm tauri dev
# o en Windows, si cargo no está en PATH:
scripts\tauri-dev.cmd

# Build de producción
pnpm tauri build

# Auto-formatear
pnpm format
```

---

## Tests

```bash
# Frontend (Vitest + jsdom) — 137 tests
pnpm test
pnpm test:watch

# Backend Rust — 69 tests
cd src-tauri && cargo test
cd ..

# Verificar formato
pnpm format:check
```

**Resultado esperado:** los 206 tests pasan verde.

---

## Cobertura de tests

- **137 tests frontend** (Vitest, en `src/**/__tests__/`):
  - `smoke.test.ts`, `precision.test.ts` — base.
  - `precision/__tests__/money-form.test.ts` — formateo de moneda.
  - `normalizacion/__tests__/index.test.ts` — motor de frecuencias (REQ-203).
  - `agregaciones/__tests__/matriz.test.ts`, `graficos.test.ts`, `golden-mvp.test.ts` — matriz SUMIFS y golden de las 32 transacciones.
  - `simulador/__tests__/filtro.test.ts`, `debounce.test.ts`, `matriz-mejorada.test.ts` — HU-401/402/403.
  - `kpis/__tests__/index.test.ts`, `golden-excel.test.ts` — estado de resultados + golden REQ-605.
  - `components/molecules/__tests__/TransaccionForm.test.tsx` — captura transaccional.
  - `components/organisms/__tests__/` — tests de organismos (`ListaTransacciones`, `MatrizPresupuesto`, `DistribucionChart`, `SimuladorPanel`, `EstadoResultadosPanel`).
- **69 tests backend** (`cargo test`, en `src-tauri/tests/`):
  - `migrations_test.rs`, `db_path_test.rs`, `sql_plugin_test.rs`, `capabilities_test.rs` — ÉPICA 1.
  - `categorias_seed_test.rs`, `transacciones_repo_test.rs`, `transacciones_aggregate_test.rs` — ÉPICA 2 + 3.
  - `simulador_repo_test.rs` — ÉPICA 4 (backend del simulador).
  - `kpis_test.rs` — ÉPICA 5 (engine Rust de KPIs).

**206 tests verde, 0 fallando.**

---

## Estructura del repo

```
docs/                                # PRD + análisis técnico del Excel fuente
openspec/                            # SDD artifacts (proposal, spec, design, tasks, tests plans, MVP-COMPLETE)
  changes/mvp-financiero-local-first/
scripts/                             # Scripts Python para análisis del Excel + wrappers Windows
src/                                 # Frontend React
  components/                        # Atomic Design (molecules, organisms)
    molecules/                       # TransaccionForm.tsx
    organisms/                       # ListaTransacciones, MatrizPresupuesto, DistribucionChart, SimuladorPanel, EstadoResultadosPanel, SelectorPerfil
  data/                              # Módulos de datos e IPC tipado (tauri-commands.ts, categorias-seed.ts, perfil-activo.ts)
  domain/                            # Lógica pura TS (matriz, normalización, simulador, KPIs, precisión)
    normalizacion/                   # Divisor por frecuencia (REQ-203)
    agregaciones/                    # SUMIFS virtual + gráficos (REQ-301, REQ-302)
    simulador/                       # Filtro, debounce, matriz mejorada (REQ-401..403)
    kpis/                            # Engine estado de resultados (REQ-501, REQ-502, REQ-605)
    precision/                       # decimal.js + form helpers
  __tests__/                         # smoke + precision
src-tauri/                           # Backend Rust
  src/                               # Módulos Rust (migrations, transacciones, simulador, kpis)
  tests/                             # Tests cargo (11 archivos)
  migrations/                        # SQL versionado (001_inicial.sql)
```

---

## Arquitectura (resumen)

Capas (de arriba hacia abajo, dependencias siempre hacia abajo):

```
┌────────────────────────────────────────────────────────────────┐
│  CAPA PRESENTACIÓN (React 18 + TypeScript + Vite)              │
│  - 4 Pestañas: Mis Finanzas, Presupuesto, Simulador de         │
│    Oportunidades, Estado de Resultados                         │
│  - Componentes UI: Organisms + Molecules                       │
│  - Gráficos: Recharts (tortas de distribución por categoría)   │
├────────────────────────────────────────────────────────────────┤
│  CAPA LÓGICA DE NEGOCIO (TS puro, sin React)                  │
│  - normalizacion/      (divisor por frecuencia)                │
│  - kpis/               (FA1, FA2, Cap.Inversión)               │
│  - agregaciones/       (SUMIFS virtual, left join Simulador)   │
│  - precision/          (decimal.js, redondeo bancario)         │
├────────────────────────────────────────────────────────────────┤
│  CAPA DATOS Y ESTADO (IPC tipado Tauri + React State)          │
├────────────────────────────────────────────────────────────────┤
│  CAPA PERSISTENCIA (clientes tipados de tauri-plugin-sql)      │
├────────────────────────────────────────────────────────────────┤
│  CAPA IPC (Tauri v2 + capabilities)                            │
└────────────────────────────────────────────────────────────────┘
```

**Reglas arquitectónicas clave:**

1. **Cero columnas calculadas en SQL.** La tabla `Transacciones` guarda `valor_centavos` y `frecuencia`. El equivalente mensual es siempre derivado. Cualquier cambio se propaga solo.
2. **Capacidades mínimas:** solo `core:default` + `sql:default`, `sql:allow-execute`, `sql:allow-select`. Sin `fs:`, `shell:`, `http:`.
3. **CHECK constraints en SQL** para todos los enums: `frecuencia`, `naturaleza_necesidad`, `comportamiento`, `tipo_flujo`.

---

## Decisiones arquitectónicas clave (locked)

Las 6 decisiones locked del MVP, reproducidas desde `openspec/changes/mvp-financiero-local-first/proposal.md` §3:

1. **Idioma UI:** español neutro LATAM sin voseo, formalidad "tú", sin selector de locale en v1.
2. **Salario Personal Objetivo en FA2 inicial:** NO se descuenta al inicio (replica el Excel; `-$1,145,000`). El salario descuenta solo en el modo "Mejorado".
3. **Librería de gráficos:** Recharts (SVG-based, declarativo, ~100KB gzipped).
4. **Validación de enums:** CHECK constraints en SQL dentro de las migraciones de Tauri.
5. **Sin límite duro de transacciones:** la UI implementa scroll virtualizado/paginación cuando crece más allá del umbral de UX (diferido en el MVP, queda en backlog post-MVP).
6. **Soporte multi-usuario:** múltiples perfiles en la misma DB, selector al abrir la app.

---

## Convenciones

- **Ramas**: `feat/ep{N}-{slug-epica}` (nunca commit directo a `main`).
- **Commits**: Conventional Commits en español, scope en español. Ejemplos en `openspec/changes/mvp-financiero-local-first/tasks.md` §B.
- **Idioma de artifacts** (código, identificadores, comentarios, UI): español por convención del proyecto. Strings técnicas, código e identificadores en inglés.
- **Idioma de commits y docs de usuario**: español neutro.

Más detalles en [`CONTRIBUTING.md`](CONTRIBUTING.md): convención de commits en inglés, política TDD (test-first), y las reglas duras del proyecto.

---

## Licencia

Privado. Todos los derechos reservados.
