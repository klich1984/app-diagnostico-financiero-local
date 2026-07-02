# Diseño Técnico: MVP Financiero Local-First

> **Trazabilidad**: este documento es ejecutable. La fase `sdd-apply` lo lee como blueprint y comienza a codificar. Las decisiones y el "qué" están en `proposal.md` y `spec.md`; aquí se define el "cómo".
>
> **Reglas duras del usuario (inmutables)**: ver §19 al final. Resumen: (1) toda feature va en rama propia, (2) Conventional Commits, (3) **no borrar nada sin consentimiento explícito**, (4) el usuario revisa y corre tests por su cuenta en cada etapa — no auto-aprobar fases.

---

## 1. Resumen de arquitectura

Aplicación de escritorio empaquetada con **Tauri v2** que ejecuta un binario Rust como backend local y embebe un WebView con la SPA React. La persistencia vive en un archivo SQLite dentro del directorio de datos de la app, manipulado exclusivamente por el backend Rust vía `tauri-plugin-sql`. La UI no toca el filesystem ni la red: todo acceso a la DB y al sistema operativo pasa por comandos IPC tipados con un sandbox de capacidades explícito.

El cómputo financiero se ejecuta en el **frontend** (TypeScript + `decimal.js`) sobre los datos leídos desde SQLite. La regla de oro: **la DB es la única fuente de verdad**, no se persisten columnas calculadas (ni equivalentes mensuales, ni KPIs, ni anualizaciones). Toda agregación se recalcula en cada lectura y la precisión se preserva en `decimal.js` hasta el render.

Capas (de arriba hacia abajo, dependencias siempre hacia abajo):

```
┌────────────────────────────────────────────────────────────────┐
│  CAPA PRESENTACIÓN (React 18 + TypeScript + Vite)              │
│  - Páginas (Pestañas): Mis Finanzas, Presupuesto, Simulador,   │
│    Presupuesto Mejorado, Estado de Resultados                  │
│  - Componentes UI: Atomic Design (atoms → molecules → pages)   │
│  - Gráficos: Recharts (tortas, barras, distribución %)         │
├────────────────────────────────────────────────────────────────┤
│  CAPA LÓGICA DE NEGOCIO (TS puro, sin React)                  │
│  - normalizacion/      (divisor por frecuencia)                │
│  - kpis/               (FA1, FA2, Cap.Inversión)               │
│  - agregaciones/       (SUMIFS virtual, left join Simulador)   │
│  - precision/          (decimal.js, redondeo bancario)         │
├────────────────────────────────────────────────────────────────┤
│  CAPA ESTADO (Zustand stores tipados)                          │
│  - usePerfilStore, useTransaccionesStore, useSimuladorStore,   │
│    usePresupuestoStore (derivados), useEstadoResultadosStore   │
├────────────────────────────────────────────────────────────────┤
│  CAPA DATOS (clientes tipados de tauri-plugin-sql)             │
│  - db/transacciones.repo.ts, db/usuarios.repo.ts, etc.         │
│  - ipc/commands.ts: cmd_insert_transaccion, cmd_obtener_…      │
├────────────────────────────────────────────────────────────────┤
│  CAPA IPC (Tauri v2 + capabilities)                           │
│  - Comandos Rust expuestos en src-tauri/src/commands/          │
│  - Sandbox por capability file: solo sql:default, sin fs:,     │
│    sin shell:, sin http:                                       │
├────────────────────────────────────────────────────────────────┤
│  CAPA RUST (backend Tauri)                                     │
│  - Estado: connection pool SQLite (1 conexión writer + N       │
│    readers), ruta a DB en BaseDirectory::App                   │
│  - Migraciones: registry versionado en Rust                    │
│  - Comandos: thin wrappers sobre repositorio                   │
├────────────────────────────────────────────────────────────────┤
│  CAPA PERSISTENCIA                                             │
│  - SQLite: archivo único misfinanzas.db en %APPDATA%/mvp-fin/  │
│  - DDL: 4 tablas (Usuarios, Categorias, Transacciones,         │
│    Simulador) + tabla _migrations                              │
│  - Montos en INTEGER (centavos Int64), CHECK constraints       │
└────────────────────────────────────────────────────────────────┘
```

**Reglas arquitectónicas clave**:

1. **Cero columnas calculadas en SQL**. La tabla `Transacciones` guarda `valor_centavos` (monto base en centavos) y `frecuencia`. El equivalente mensual es siempre derivado. Esto evita drift y hace que un cambio de frecuencia o valor se propague solo.
2. **Cálculo en el frontend**. `decimal.js` corre en el WebView, no en Rust. La justificación: el motor de cálculo necesita ser inspeccionable, testeable con Vitest y comparable 1:1 con el Excel. Rust queda para I/O y serialización, no para aritmética financiera.
3. **Flush on close del Simulador**. El Simulador usa debounce para no martillar la DB en cada tecla, pero cualquier cambio en vuelo se materializa en SQLite ante `beforeunload` y ante el evento `tauri://close-requested` de Tauri.
4. **Capacidades mínimas**. La WebView solo puede hablar con `sql:default`. No tiene `fs:`, `shell:`, `http:`, `os:`. Esto es por seguridad y porque el MVP no los necesita.
5. **Multi-perfil filtra en SQL, no en memoria**. Toda query a `Transacciones` lleva `WHERE usuario_id = :active_perfil`. Esto hace imposible la contaminación cruzada por bug de filtrado en el cliente.

---

## 2. Topología de procesos

Tauri v2 corre dos procesos en el mismo binario: el **proceso principal Rust** (host) y el **WebView** que renderiza la SPA. Se comunican por un canal IPC asíncrono serializado en JSON.

```
   ┌──────────────────────────┐         ┌──────────────────────────┐
   │   PROCESO WEBVIEW        │         │   PROCESO RUST (HOST)    │
   │   (Chromium embebido)    │         │   Tauri v2               │
   │                          │         │                          │
   │  React 18 + TypeScript   │  IPC    │  Tauri Runtime          │
   │  Zustand stores          │ ──────► │  - command handlers     │
   │  decimal.js / cálculos   │ invoke  │  - event bus            │
   │  Recharts                │ ◄────── │  - capability gate      │
   │  tauri-plugin-sql (JS)   │  events │  - tauri-plugin-sql     │
   │                          │         │  - rusqlite (Pool)      │
   └──────────────┬───────────┘         └──────────────┬───────────┘
                  │                                    │
                  │ tauri-plugin-sql                   │
                  │ internamente hace                  │ rusqlite
                  │ invoke('plugin:sql|execute')       │ directo
                  └────────────────────────────────────┘
                                       │
                                       ▼
                          ┌──────────────────────┐
                          │  misfinanzas.db      │
                          │  %APPDATA%/mvp-fin/  │
                          │  SQLite (archivo)    │
                          └──────────────────────┘
```

**Eventos clave del ciclo de vida**:

| Evento | Origen | Acción en backend | Acción en frontend |
|--------|--------|-------------------|---------------------|
| `tauri://ready` | Tauri | Carga DB, corre migraciones pendientes | Hidrata stores con datos del usuario activo |
| `app:perfil-seleccionado` | Frontend | (ninguna) | Filtra todas las queries por `usuario_id` |
| `tauri://close-requested` | Tauri (al cerrar ventana) | Drena `simulador_pending_queue` a SQLite | Limpia timers de debounce |
| `window:beforeunload` | WebView | (ninguna directo) | Dispara `flushSimulador()` antes de salir |

**Canales IPC explícitos** (definidos en `src-tauri/capabilities/default.json`):

- `sql:default` — carga de DB, execute, select, close
- `sql:allow-execute`, `sql:allow-select`, `sql:allow-load` (sub-permisos del plugin)
- **No** se exponen: `core:event`, `core:webview`, `core:window` desde la app, ni `fs:*`, `shell:*`, `http:*`, `os:*`, `dialog:*` (no se necesitan en v1)

> Nota: el runtime de Tauri necesita sus permisos internos (`core:default`, `core:event:default`) para que la app funcione, pero ningún comando custom de la app queda expuesto al WebView sin estar en `capabilities/`.

---

## 3. Estrategia de branching y commits

### 3.1. Modelo de ramas

Se sigue **GitHub Flow con Feature Branches por épica y por HU**. La rama `main` siempre está en estado desplegable (build verde). Las features se ramifican desde `main`, se mergean vía PR, y se eliminan al integrar.

```
                            ┌──────────────┐
                            │    main      │  ← siempre verde
                            └──────┬───────┘
                                   │
        ┌──────────────────────────┼──────────────────────────┐
        │                          │                          │
   ┌────▼─────────┐         ┌──────▼────────┐         ┌───────▼──────┐
   │ feat/ep1-arq │         │ feat/ep2-cap  │         │ feat/ep4-sim │
   │ -hu101       │         │ -hu201        │         │ -hu401       │
   │ -hu102       │         │ -hu202        │         │ -hu402       │
   │ -hu103       │         │ -hu203        │         │ -hu403       │
   └──────┬───────┘         └──────┬────────┘         └───────┬──────┘
          │ PR → main              │ PR → main                │ PR → main
          ▼                        ▼                          ▼
       (merge)                  (merge)                    (merge)
```

**Convención de nombres de ramas**:

- `feat/ep{N}-{slug-epica}` — épica completa (ej: `feat/ep1-arquitectura-persistencia`)
- `feat/ep{N}-{slug-epica}-hu{NNN}` — HU individual dentro de la épica (ej: `feat/ep1-arq-hu103-migraciones`)
- `fix/{slug}` — bugfix (ej: `fix/simulador-debounce-flush-on-close`)
- `chore/{slug}` — tareas sin impacto funcional (ej: `chore/readme-quickstart`)
- `docs/{slug}` — solo docs (ej: `docs/decisiones-moneda-futuro`)
- `refactor/{slug}` — refactor sin cambio funcional
- `test/{slug}` — solo agregado de tests

**Reglas de merge**:

- PR debe tener al menos 1 review del usuario (no self-merge).
- `cargo tauri build` debe pasar en CI (cuando exista) o localmente.
- `cargo test` + `pnpm test` deben pasar.
- Si el PR excede **400 líneas de diff**, se parte en chained PRs (ver §13 y §17).
- Borrar la rama local y remoto después de merge.

### 3.2. Conventional Commits

Formato obligatorio, scope y descripción en **español neutro**:

```
<tipo>(<alcance>): <descripción en español neutro, sin mayúscula inicial, sin punto final>

[cuerpo opcional: motivación, decisiones, refs]

[footer opcional: refs a HU, closes #N]
```

**Tipos permitidos** (alineados al estándar):

| Tipo | Cuándo |
|------|--------|
| `feat` | Nueva feature visible para el usuario |
| `fix` | Bug fix |
| `chore` | Mantenimiento, deps, build |
| `docs` | Solo documentación |
| `test` | Solo tests |
| `refactor` | Cambio interno sin cambio funcional |
| `perf` | Mejora de performance medible |
| `build` | Cambios en sistema de build |
| `ci` | Cambios en CI |

**Ejemplos válidos**:

```text
feat(transacciones): agregar captura interactiva con multiplicación por 100

- Implementa formulario reactivo con debounce de 300ms
- Aplica divisor por frecuencia en el motor de normalización
- Persiste en tabla Transacciones con valor_centavos

Refs: HU-202, REQ-202
```

```text
fix(simulador): forzar flush on app close para no perder ediciones en vuelo

- Suscribe handler a tauri://close-requested
- Drena cola pending_queue a SQLite antes de cerrar ventana
- Cubre con test de regresión

Refs: REQ-402
```

```text
chore(deps): actualizar tauri a 2.1.0 y rust a 1.75
```

```text
docs(arquitectura): documentar patrón expand-migrate-contract para CHECK constraints
```

**Reglas adicionales**:

- Una HU = típicamente 1 commit grande o 2-4 commits chicos si conviene.
- Un commit no debe contener cambios de más de una HU.
- Commits atómicos: el build debe pasar tras cada commit (no commits rotos a propósito).
- **Nunca** incluir `Co-Authored-By: AI` ni atribución a IA en el mensaje.
- **Nunca** usar `--no-verify` salvo que el usuario lo pida explícito.

---

## 4. Estructura de carpetas

Árbol objetivo del repositorio. Las carpetas con sufijo `// futuro` se documentan pero no se crean en v1.

```
mpv-app-financiera-v1/
├── .atl/                              ← OpenSpec config + skill registry
│   ├── config.yaml
│   └── skill-registry.md
├── openspec/
│   ├── config.yaml
│   ├── specs/                         ← specs base (vacío en v1, se llena en archive)
│   └── changes/
│       └── mvp-financiero-local-first/
│           ├── README.md              ← ya existe
│           ├── explore.md             ← ya existe
│           ├── proposal.md            ← ya existe
│           ├── spec.md                ← ya existe
│           ├── design.md              ← este archivo
│           ├── tasks.md               ← (lo crea sdd-tasks)
│           └── verify-report.md       ← (lo crea sdd-verify)
│
├── docs/
│   ├── Plantilla-diagnóstico-financiero-(Ejemplo).xlsx
│   ├── analisis-plantilla-financiera.md
│   ├── arquitectura/                  ← docs técnicas
│   │   ├── decisiones.md
│   │   ├── modelo-datos.md
│   │   └── motor-calculo.md
│   └── adr/                           ← Architecture Decision Records
│       ├── 0001-tauri-vs-electron.md
│       ├── 0002-recharts-vs-chartjs.md
│       └── 0003-decimal-precision.md
│
├── scripts/
│   ├── extract_xlsx.py                ← ya existe
│   ├── generar_analisis_md.py         ← ya existe
│   └── fixtures/                      ← JSONs generados desde el Excel
│       ├── 32_transacciones.json      ← dataset golden
│       └── kpis_esperados.json        ← valores esperados por KPI
│
├── src/                               ← FRONTEND (React + TS)
│   ├── main.tsx                       ← entry point
│   ├── App.tsx                        ← router + providers
│   ├── index.css                      ← Tailwind imports
│   │
│   ├── components/                    ← Atomic Design
│   │   ├── atoms/
│   │   │   ├── Button.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── NumberInput.tsx        ← parsea "1.500.000" → 1500000
│   │   │   ├── Select.tsx
│   │   │   ├── Badge.tsx
│   │   │   └── Tooltip.tsx
│   │   ├── molecules/
│   │   │   ├── TransaccionForm.tsx
│   │   │   ├── KpiCard.tsx
│   │   │   ├── SelectorPerfil.tsx
│   │   │   ├── FilaSimulador.tsx
│   │   │   └── ConfirmDialog.tsx
│   │   ├── organisms/
│   │   │   ├── TablaTransacciones.tsx
│   │   │   ├── MatrizPresupuesto.tsx
│   │   │   ├── PanelSimulador.tsx
│   │   │   ├── EstadoResultadosDual.tsx
│   │   │   └── GraficosDistribucion.tsx
│   │   └── pages/                     ← Una página por pestaña
│   │       ├── MisFinanzasPage.tsx
│   │       ├── PresupuestoPage.tsx
│   │       ├── SimuladorPage.tsx
│   │       ├── PresupuestoMejoradoPage.tsx
│   │       └── EstadoResultadosPage.tsx
│   │
│   ├── domain/                        ← LÓGICA DE NEGOCIO (puro, sin React)
│   │   ├── tipos.ts                   ← interfaces TypeScript compartidas
│   │   ├── normalizacion/
│   │   │   ├── frecuencias.ts         ← mapa divisor por frecuencia
│   │   │   └── mensualizar.ts         ← funcion pura valor/frecuencia → mensual
│   │   ├── kpis/
│   │   │   ├── flujoAhorro1.ts        ← TotalIngresos - GastosNecesarios
│   │   │   ├── flujoAhorro2.ts        ← FA1 - GastosVariablesNecesarios
│   │   │   └── capacidadInversion.ts  ← FA2 - SalarioPersonalObjetivo
│   │   ├── agregaciones/
│   │   │   ├── sumifs.ts              ← replica de SUMIFS por categoria/naturaleza
│   │   │   ├── leftJoinSimulador.ts   ← materialización del join
│   │   │   └── distribucion.ts        ← calculo de porcentajes
│   │   └── precision/
│   │       └── decimal.ts             ← wrapper sobre decimal.js, política redondeo
│   │
│   ├── stores/                        ← Zustand
│   │   ├── usePerfilStore.ts
│   │   ├── useTransaccionesStore.ts
│   │   ├── useSimuladorStore.ts       ← incluye pendingQueue para debounce
│   │   ├── usePresupuestoStore.ts     ← derivado, sin persistencia propia
│   │   └── useEstadoResultadosStore.ts
│   │
│   ├── db/                            ← Capa de datos (cliente)
│   │   ├── connection.ts              ← wrapper sobre tauri-plugin-sql
│   │   ├── usuarios.repo.ts
│   │   ├── categorias.repo.ts
│   │   ├── transacciones.repo.ts
│   │   ├── simulador.repo.ts
│   │   └── migraciones.repo.ts
│   │
│   ├── ipc/
│   │   └── commands.ts                ← nombres de comandos IPC tipados
│   │
│   ├── hooks/
│   │   ├── useDebounce.ts
│   │   ├── useFlushOnClose.ts
│   │   └── usePerfilActivo.ts
│   │
│   ├── lib/
│   │   ├── format.ts                  ← formatMonto(), formatPorcentaje()
│   │   └── errors.ts                  ← traducción de errores SQL → mensajes UI
│   │
│   └── tests/
│       ├── setup.ts
│       ├── unit/
│       │   ├── normalizacion.test.ts
│       │   ├── kpis.test.ts
│       │   ├── decimal.test.ts
│       │   └── sumifs.test.ts
│       ├── golden/
│       │   ├── 32_transacciones.golden.test.ts
│       │   └── simulador_base.golden.test.ts
│       └── helpers/
│           └── cargarFixture.ts
│
├── src-tauri/                         ← BACKEND (Rust)
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── build.rs
│   ├── icons/
│   ├── capabilities/
│   │   └── default.json               ← capability mínima
│   └── src/
│       ├── main.rs                    ← entry point Rust
│       ├── lib.rs                     ← run() exportado a main.rs
│       ├── state.rs                   ← AppState (Pool SQLite, ruta DB)
│       ├── db/
│       │   ├── mod.rs
│       │   ├── connection.rs          ← apertura del pool rusqlite
│       │   └── migraciones.rs         ← registry de migraciones versionadas
│       ├── commands/                  ← comandos IPC expuestos
│       │   ├── mod.rs
│       │   ├── usuarios.rs
│       │   ├── transacciones.rs
│       │   └── simulador.rs
│       ├── modelos/                   ← structs Rust (mirror de tablas)
│       │   ├── mod.rs
│       │   ├── usuario.rs
│       │   ├── categoria.rs
│       │   ├── transaccion.rs
│       │   └── simulador.rs
│       └── errores.rs                 ← tipo AppError serializable a JS
│
├── .gitignore
├── .gitattributes
├── README.md
├── package.json
├── pnpm-lock.yaml                     ← (o package-lock.json si se usa npm)
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── tailwind.config.ts
├── postcss.config.cjs
├── vitest.config.ts
└── .editorconfig
```

**Justificación por carpeta**:

- `src/domain/`: el corazón del cálculo. Sin React, sin Tauri, sin stores. Pura lógica testeable. Esto es lo que permite comparar contra el Excel sin un browser.
- `src/db/`: única carpeta que sabe nombres de tablas y columnas. Si en v2 se cambia a IndexedDB o a una API remota, solo este módulo cambia.
- `src/stores/`: estado de UI y de lectura, no persistencia. Zustand se eligió por su baja ceremonia.
- `src-tauri/src/`: backend thin. La lógica pesada está en `src/domain/`. Rust solo orquesta I/O, migraciones y comandos IPC.
- `docs/adr/`: decisiones de arquitectura documentadas (formato ADR de Michael Nygard). Cada nueva decisión técnica significativa va acá.
- `scripts/fixtures/`: archivos JSON generados desde el Excel. Se commitean al repo y son la fuente de los golden tests. Reproducibilidad bit-a-bit.

---

## 5. Modelo de datos relacional

### 5.1. Tabla `_migrations` (control interno)

```sql
CREATE TABLE IF NOT EXISTS _migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version INTEGER NOT NULL UNIQUE,
    nombre TEXT NOT NULL,
    aplicada_en INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    sha256 TEXT NOT NULL                       -- hash del SQL aplicado, detecta drift
);
```

> Esta tabla no es del dominio; es interna del sistema de migraciones. Vive en la misma DB.

### 5.2. Tabla `Usuarios`

```sql
CREATE TABLE IF NOT EXISTS Usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL CHECK (length(trim(nombre)) > 0),
    moneda TEXT NOT NULL DEFAULT 'LOCAL' CHECK (moneda IN ('LOCAL')),  -- preparado para futuro
    salario_personal_objetivo_centavos INTEGER NOT NULL DEFAULT 0
        CHECK (salario_personal_objetivo_centavos >= 0),
    modo_mejorado_activo INTEGER NOT NULL DEFAULT 0
        CHECK (modo_mejorado_activo IN (0, 1)),
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_nombre_unique
    ON Usuarios (nombre COLLATE NOCASE);

CREATE INDEX IF NOT EXISTS idx_usuarios_modo_mejorado
    ON Usuarios (modo_mejorado_activo);
```

Notas:

- `moneda` se reserva desde v1 con un solo valor válido (`LOCAL`) para que la migración a multi-moneda no requiera tocar la tabla ni las FKs.
- `salario_personal_objetivo_centavos` es 0 por defecto → replica el comportamiento del Excel donde no se descuenta salario en el flujo inicial.
- `modo_mejorado_activo` es un INTEGER con CHECK en {0, 1} (booleano SQLite-style).

### 5.3. Tabla `Categorias`

```sql
CREATE TABLE IF NOT EXISTS Categorias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL CHECK (length(trim(nombre)) > 0),
    tipo_flujo TEXT NOT NULL CHECK (tipo_flujo IN ('Ingreso', 'Gasto')),
    es_esencial_defecto INTEGER,           -- NULL, 0 o 1; default sugerido en UI
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_categorias_nombre_tipo_unique
    ON Categorias (nombre COLLATE NOCASE, tipo_flujo);

CREATE INDEX IF NOT EXISTS idx_categorias_tipo_flujo
    ON Categorias (tipo_flujo);
```

**Categorías precargadas** (datos sembrados en migración inicial):

- Gastos: `Hogar`, `Alimentación`, `Transporte`, `Provisiones`, `Deudas entidades`, `Deudas conocidos`, `Entretenimiento`, `Familia`, `Impuestos`, `Otros gastos`.
- Ingresos: `Salario`, `Otros ingresos`, `Negocio`, `Inversión`.

> Estas 14 categorías vienen del análisis del Excel (`docs/analisis-plantilla-financiera.md` §6). La UI las muestra en un dropdown filtrado por `tipo_flujo`.

### 5.4. Tabla `Transacciones`

```sql
CREATE TABLE IF NOT EXISTS Transacciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL,
    tipo_flujo TEXT NOT NULL CHECK (tipo_flujo IN ('Ingreso', 'Gasto')),
    categoria_id INTEGER NOT NULL,
    concepto TEXT NOT NULL CHECK (length(trim(concepto)) > 0),
    frecuencia TEXT NOT NULL CHECK (frecuencia IN (
        'Mensual', 'Bimensual', 'Trimestral', 'Semestral', 'Anual'
    )),
    comportamiento TEXT CHECK (comportamiento IN ('Fijo', 'Variable')),
    naturaleza_necesidad TEXT CHECK (
        naturaleza_necesidad IS NULL OR
        naturaleza_necesidad IN ('Necesario', 'No tan necesario', 'No necesario')
    ),
    valor_centavos INTEGER NOT NULL CHECK (valor_centavos > 0),
    notas TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),

    FOREIGN KEY (usuario_id)   REFERENCES Usuarios(id)   ON DELETE CASCADE,
    FOREIGN KEY (categoria_id) REFERENCES Categorias(id) ON DELETE RESTRICT,

    -- Reglas cruzadas
    CHECK (
        (tipo_flujo = 'Gasto'   AND comportamiento IS NOT NULL AND naturaleza_necesidad IS NOT NULL)
        OR
        (tipo_flujo = 'Ingreso' AND comportamiento IS NULL      AND naturaleza_necesidad IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_transacciones_usuario
    ON Transacciones (usuario_id);

CREATE INDEX IF NOT EXISTS idx_transacciones_usuario_tipo
    ON Transacciones (usuario_id, tipo_flujo);

CREATE INDEX IF NOT EXISTS idx_transacciones_usuario_categoria
    ON Transacciones (usuario_id, categoria_id);

CREATE INDEX IF NOT EXISTS idx_transacciones_usuario_naturaleza
    ON Transacciones (usuario_id, naturaleza_necesidad)
    WHERE naturaleza_necesidad IS NOT NULL;
```

Notas:

- `valor_centavos` es siempre positivo; el signo lo da `tipo_flujo`.
- El CHECK cruzado garantiza que un Ingreso no lleve `naturaleza_necesidad` (mitiga el riesgo #8 del proposal).
- Los índices cubren los 3 patrones de query dominantes: por usuario, por usuario+tipo, por usuario+categoría, por usuario+naturaleza (parcial porque solo Gastos la tienen).
- `ON DELETE CASCADE` en `usuario_id`: borrar el usuario borra sus transacciones. `ON DELETE RESTRICT` en `categoria_id`: no se puede borrar una categoría con transacciones (mitiga el riesgo "borrar sin consentimiento": el borrado falla ruidosamente).

### 5.5. Tabla `Simulador`

```sql
CREATE TABLE IF NOT EXISTS Simulador (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL,
    transaccion_id INTEGER NOT NULL,
    nuevo_valor_mensual_centavos INTEGER NOT NULL CHECK (nuevo_valor_mensual_centavos >= 0),
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),

    FOREIGN KEY (usuario_id)    REFERENCES Usuarios(id)       ON DELETE CASCADE,
    FOREIGN KEY (transaccion_id) REFERENCES Transacciones(id) ON DELETE CASCADE,

    -- Una sola propuesta activa por transaccion
    UNIQUE (transaccion_id)
);

CREATE INDEX IF NOT EXISTS idx_simulador_usuario
    ON Simulador (usuario_id);
```

Notas:

- Una fila por transacción que el usuario está simulando. La unicidad se garantiza con `UNIQUE (transaccion_id)`.
- `nuevo_valor_mensual_centavos >= 0` permite proponer 0 (eliminar el gasto) o cualquier valor positivo.
- El `LEFT JOIN` para construir el Presupuesto Mejorado se hace en `src/domain/agregaciones/leftJoinSimulador.ts`, no en SQL, para mantener una única capa de cálculo en TypeScript.

### 5.6. Plan de migraciones inicial (versión 1)

```rust
// src-tauri/src/db/migraciones.rs (extracto)

pub fn registrar() -> Vec<Migracion> {
    vec![
        Migracion::nueva(1, "schema_inicial_v1", include_str!("../../migrations/001_inicial.sql")),
    ]
}
```

El archivo `migrations/001_inicial.sql` contiene todos los `CREATE TABLE` y `CREATE INDEX` de arriba en el orden: `_migrations` → `Usuarios` → `Categorias` (vacía) → `Transacciones` → `Simulador`. Después de crear las tablas, un bloque `INSERT INTO Categorias` siembra las 14 categorías. Todo en una sola transacción SQL para atomicidad.

### 5.7. Trigger de `updated_at` (opcional, recomendado)

```sql
CREATE TRIGGER IF NOT EXISTS trg_transacciones_updated_at
AFTER UPDATE ON Transacciones
FOR EACH ROW
BEGIN
    UPDATE Transacciones SET updated_at = strftime('%s', 'now') WHERE id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_simulador_updated_at
AFTER UPDATE ON Simulador
FOR EACH ROW
BEGIN
    UPDATE Simulador SET updated_at = strftime('%s', 'now') WHERE id = OLD.id;
END;
```

> Decisión: triggers opcionales en v1. Si se prefiere, la app puede mandar `updated_at` desde el repositorio. Recomendación: **usar triggers** para que el backend no se olvide de actualizarlos nunca.

---

## 6. Capa Rust (Tauri backend)

### 6.1. Módulos

```
src-tauri/src/
├── main.rs                  # entry: lib::run()
├── lib.rs                   # monta el builder, registra comandos y plugins
├── state.rs                 # AppState: pool SQLite + ruta DB
├── errores.rs               # AppError → serializable JSON a JS
├── db/
│   ├── mod.rs
│   ├── connection.rs        # abre el pool, configura WAL, FKs
│   └── migraciones.rs       # registry + runner
├── commands/
│   ├── mod.rs               # macro para registrar comandos
│   ├── usuarios.rs          # cmd_crear_usuario, cmd_obtener_usuario_activo, …
│   ├── categorias.rs        # cmd_listar_categorias (solo lectura en v1)
│   ├── transacciones.rs     # cmd_insert_transaccion, cmd_update_…, cmd_delete_…
│   └── simulador.rs         # cmd_set_simulador, cmd_get_simulador, cmd_flush_pending
└── modelos/
    ├── usuario.rs
    ├── categoria.rs
    ├── transaccion.rs
    └── simulador.rs
```

### 6.2. Comandos IPC expuestos

La capa Tauri expone comandos con prefijo `cmd_`. La capa JS los invoca con `invoke<T>(nombre, args)`. Todos los nombres siguen la convención:

| Comando | Firma (JS) | Descripción |
|---------|------------|-------------|
| `cmd_crear_usuario` | `(nombre: string): Promise<number>` | Inserta un usuario; devuelve id |
| `cmd_listar_usuarios` | `(): Promise<Usuario[]>` | Lista todos los perfiles |
| `cmd_obtener_usuario` | `(id: number): Promise<Usuario \| null>` | Carga un usuario por id |
| `cmd_actualizar_usuario` | `(id: number, patch: Partial<UsuarioPatch>): Promise<void>` | Patch parcial (ej: salario objetivo) |
| `cmd_set_modo_mejorado` | `(usuario_id: number, activo: boolean): Promise<void>` | Activa/desactiva modo |
| `cmd_listar_categorias` | `(tipo_flujo?: 'Ingreso' \| 'Gasto'): Promise<Categoria[]>` | Lee el catálogo |
| `cmd_insert_transaccion` | `(t: TransaccionInput): Promise<number>` | Inserta y devuelve id |
| `cmd_update_transaccion` | `(id: number, patch: Partial<TransaccionInput>): Promise<void>` | Patch parcial |
| `cmd_delete_transaccion` | `(id: number): Promise<void>` | Borra (con CHECK FK, ver §19) |
| `cmd_listar_transacciones` | `(usuario_id: number): Promise<Transaccion[]>` | Lista del usuario activo |
| `cmd_set_simulador` | `(transaccion_id: number, nuevo_valor: number): Promise<void>` | Upsert en Simulador |
| `cmd_get_simulador` | `(usuario_id: number): Promise<SimuladorFila[]>` | Lee el Simulador del usuario |
| `cmd_flush_simulador` | `(usuario_id: number, entries: SimuladorFila[]): Promise<void>` | Bulk-upsert al cerrar ventana |
| `cmd_ejecutar_migraciones` | `(): Promise<void>` | Solo dev; no expuesto en release |

> Los comandos reciben objetos validados con `serde::Deserialize` y devuelven `Result<T, AppError>`. La app JS nunca recibe strings crudos de SQLite: Tauri los serializa por el canal IPC.

### 6.3. Manejo de errores

```rust
// src-tauri/src/errores.rs (extracto)

use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("base de datos: {0}")]
    Db(#[from] rusqlite::Error),

    #[error("validación: {0}")]
    Validacion(String),

    #[error("no encontrado: {0}")]
    NoEncontrado(String),

    #[error("conflicto: {0}")]
    Conflicto(String),

    #[error("interno: {0}")]
    Interno(String),
}

impl Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        let mut st = s.serialize_struct("AppError", 2)?;
        let kind = match self {
            AppError::Db(_) => "db",
            AppError::Validacion(_) => "validacion",
            AppError::NoEncontrado(_) => "no_encontrado",
            AppError::Conflicto(_) => "conflicto",
            AppError::Interno(_) => "interno",
        };
        st.serialize_field("kind", kind)?;
        st.serialize_field("message", &self.to_string())?;
        st.end()
    }
}
```

La capa JS traduce `kind` → mensaje legible con i18n en español (ver `src/lib/errors.ts`).

### 6.4. Persistencia del archivo DB

```rust
// src-tauri/src/db/connection.rs (extracto)

use tauri::Manager;
use tauri::path::BaseDirectory;

pub fn ruta_db(app: &tauri::AppHandle) -> Result<PathBuf, AppError> {
    let dir = app.path().resolve("", BaseDirectory::App)?;
    std::fs::create_dir_all(&dir)?;
    Ok(dir.join("misfinanzas.db"))
}

pub fn abrir_pool(ruta: &Path) -> Result<Pool<SqliteConnectionManager>, AppError> {
    let manager = SqliteConnectionManager::file(ruta)
        .with_init(|c| {
            c.execute_batch("
                PRAGMA journal_mode = WAL;
                PRAGMA foreign_keys = ON;
                PRAGMA synchronous = NORMAL;
                PRAGMA busy_timeout = 5000;
            ")
        });
    Ok(Pool::builder().max_size(4).build(manager)?)
}
```

Decisiones:

- **WAL** para concurrencia lector/escritor (la app es single-user pero queremos fluidez en la UI).
- **FKs ON** siempre. Por defecto SQLite las trae OFF.
- **Pool de 4** conexiones. Solo una escribe, las otras leen. Suficiente para 32 transacciones y para el Simulador debounced.
- **Path fijo** `%APPDATA%/mvp-financiero/misfinanzas.db` en Windows. Multi-OS va por roadmap post-MVP.

### 6.5. Flush-on-close del Simulador

El frontend mantiene una cola `pendingQueue: Map<transaccionId, centavos>` en `useSimuladorStore`. Cada cambio dispara un debounce de 300 ms que llama a `cmd_set_simulador`. Pero al cerrar la ventana:

```ts
// src/hooks/useFlushOnClose.ts (extracto)

useEffect(() => {
  const handler = () => {
    const pending = useSimuladorStore.getState().drainPending();
    if (pending.length > 0) {
      invoke('cmd_flush_simulador', {
        usuarioId: usePerfilStore.getState().activo!.id,
        entries: pending,
      });
    }
  };
  window.addEventListener('beforeunload', handler);
  // Tauri emite tauri://close-requested antes de cerrar; el handler en main.rs
  // puede esperar a un ack del frontend si fuera necesario.
  return () => window.removeEventListener('beforeunload', handler);
}, []);
```

> **Riesgo conocido** (ver §17): el evento `beforeunload` no es 100% confiable en WebViews. Se complementa con un handler en `src-tauri/src/lib.rs` que en `on_window_event` espera a que el frontend confirme `simulador:drained` antes de cerrar la ventana. Esa lógica se detalla en §10.

### 6.6. Migraciones (registry versionado)

```rust
// src-tauri/src/db/migraciones.rs (extracto)

pub struct Migracion {
    pub version: u32,
    pub nombre: String,
    pub sql: String,
}

impl Migracion {
    pub fn nueva(version: u32, nombre: &str, sql: &str) -> Self { /* ... */ }
}

pub fn registry() -> Vec<Migracion> {
    vec![
        Migracion::nueva(1, "schema_inicial_v1", include_str!("../../migrations/001_inicial.sql")),
        // futuras migraciones se agregan acá
    ]
}

pub fn ejecutar_pendientes(pool: &Pool<SqliteConnectionManager>) -> Result<(), AppError> {
    let mut conn = pool.get()?;
    let tx = conn.transaction()?;

    // 1. asegurar tabla _migrations
    tx.execute_batch(include_str!("../../migrations/000_bootstrap.sql"))?;

    // 2. leer versiones aplicadas
    let aplicadas: HashSet<u32> = tx
        .prepare("SELECT version FROM _migrations")?
        .query_map([], |r| r.get::<_, u32>(0))?
        .collect::<Result<_, _>>()?;

    // 3. aplicar pendientes en orden
    for m in registry() {
        if !aplicadas.contains(&m.version) {
            tx.execute_batch(&m.sql)?;
            tx.execute(
                "INSERT INTO _migrations(version, nombre, sha256) VALUES (?, ?, ?)",
                rusqlite::params![m.version, m.nombre, sha256_hex(&m.sql)],
            )?;
        }
    }

    tx.commit()?;
    Ok(())
}
```

> El `sha256` del SQL aplicado se guarda para detectar drift (modificación accidental del archivo de migración). Si el hash no coincide en una versión ya aplicada, se aborta con `AppError::Conflicto` y se exige intervención manual.

---

## 7. Capa React (frontend)

### 7.1. Patrón de organización

- **Atomic Design**: atoms → molecules → organisms → pages. Ningún atom conoce un molecule, ningún molecule conoce un organism, ningún organism conoce una page.
- **Contenedor vs presentación**: las pages son contenedores (conectan stores, disparan effects). Los organisms son híbridos (presentación + efectos locales mínimos). Atoms y molecules son tontos: solo props.
- **Co-localización de tipos**: cada componente tiene su `ComponentName.types.ts` adyacente si los tipos son privados.
- **Sin CSS-in-JS**: solo Tailwind. Las variantes se manejan con `clsx` o plantillas literales de template strings.

### 7.2. Stores Zustand

Forma del store central (interfaz TypeScript):

```ts
// src/stores/useTransaccionesStore.ts

import { create } from 'zustand';

export interface Transaccion {
  id: number;
  usuario_id: number;
  tipo_flujo: 'Ingreso' | 'Gasto';
  categoria_id: number;
  concepto: string;
  frecuencia: 'Mensual' | 'Bimensual' | 'Trimestral' | 'Semestral' | 'Anual';
  comportamiento: 'Fijo' | 'Variable' | null;
  naturaleza_necesidad: 'Necesario' | 'No tan necesario' | 'No necesario' | null;
  valor_centavos: number;
  notas: string | null;
  created_at: number;
  updated_at: number;
}

export interface TransaccionInput {
  tipo_flujo: 'Ingreso' | 'Gasto';
  categoria_id: number;
  concepto: string;
  frecuencia: Transaccion['frecuencia'];
  comportamiento: Transaccion['comportamiento'];
  naturaleza_necesidad: Transaccion['naturaleza_necesidad'];
  valor_centavos: number;
  notas?: string | null;
}

interface TransaccionesState {
  porUsuario: Map<number, Transaccion[]>;
  cargando: boolean;
  error: AppErrorView | null;

  cargar: (usuarioId: number) => Promise<void>;
  insertar: (usuarioId: number, input: TransaccionInput) => Promise<number>;
  actualizar: (id: number, patch: Partial<TransaccionInput>) => Promise<void>;
  eliminar: (id: number) => Promise<void>;
}
```

```ts
// src/stores/useSimuladorStore.ts

export interface SimuladorFila {
  transaccion_id: number;
  nuevo_valor_mensual_centavos: number;
}

interface SimuladorState {
  propuestas: Map<number, number>;   // transaccionId -> centavos propuesto
  pendingQueue: Map<number, number>; // cambios aún no persistidos
  cargando: boolean;

  setPropuesta: (transaccionId: number, centavos: number) => void; // debounced write
  cargar: (usuarioId: number) => Promise<void>;
  limpiar: () => void;
  drainPending: () => SimuladorFila[]; // usado por flush-on-close
}
```

```ts
// src/stores/usePerfilStore.ts

export interface PerfilActivo {
  id: number;
  nombre: string;
  salario_personal_objetivo_centavos: number;
  modo_mejorado_activo: boolean;
}

interface PerfilState {
  disponibles: PerfilActivo[];
  activo: PerfilActivo | null;
  cargando: boolean;

  listar: () => Promise<void>;
  seleccionar: (id: number) => Promise<void>;
  crear: (nombre: string) => Promise<number>;
  activarModoMejorado: (activo: boolean) => Promise<void>;
  setSalarioObjetivo: (centavos: number) => Promise<void>;
}
```

```ts
// src/stores/usePresupuestoStore.ts (derivado, sin persistencia)

interface PresupuestoState {
  // Se recalcula via useMemo desde useTransaccionesStore + useSimuladorStore
  totalesPorCategoria: Map<number, number>;   // categoriaId -> centavos mensuales
  totalesPorNaturaleza: Map<string, number>;  // 'Necesario' | ... -> centavos
  totalIngresosMensual: number;
  totalGastosMensual: number;
  flujoCajaLibre: number;
}
```

### 7.3. Hooks custom

| Hook | Propósito |
|------|-----------|
| `useDebounce<T>(value, ms)` | Genérico; usado por inputs del Simulador |
| `useFlushOnClose()` | Suscribe handler a `beforeunload` + `tauri://close-requested` |
| `usePerfilActivo()` | Devuelve perfil activo; si es null, redirige al selector |
| `useEquivalenteMensual(transaccion)` | `transaccion.valor_centavos / divisor[frecuencia]` con `decimal.js` |
| `useKpis(presupuesto)` | Recalcula FA1, FA2, Cap.Inversión reactivo al presupuesto |

### 7.4. Flujo de un cambio de input del Simulador

```
[1] Usuario tipea "200000" en input de "Restaurantes"
        │
        ▼
[2] FilaSimulador (molecule) → onChange(200000) → useSimuladorStore.setPropuesta
        │
        ▼
[3] setPropuesta actualiza state.propuestas y state.pendingQueue
        │
        ▼
[4] useDebounce (300ms) detecta cambio → invoke('cmd_set_simulador', {transaccionId, nuevoValor})
        │
        ▼
[5] Tauri → Rust → SQL: INSERT OR REPLACE INTO Simulador ...
        │
        ▼
[6] usePresupuestoStore (vía useMemo sobre stores) recalcula Total Gastos Variables
        │
        ▼
[7] Recharts re-renderiza el gráfico de torta y los KPI cards
```

Latencia objetivo end-to-end: **< 50 ms** entre el tipeo y la actualización visual. La persistencia puede ir 300 ms atrás (es invisible para el usuario).

### 7.5. Router / navegación entre pestañas

Se usa **tabs nativos** (no router de URL) porque la app es local y no necesita URLs compartibles. Un componente `Tabs` simple con state local. Las tabs son: Mis Finanzas, Presupuesto, Simulador, Presupuesto Mejorado, Estado de Resultados.

---

## 8. Modelo de normalización temporal

### 8.1. Fórmula

Para una transacción con `valor_centavos` y `frecuencia f`, el **equivalente mensual** en centavos es:

```
valor_mensual_centavos = valor_centavos / factor[f]

donde:
    factor['Mensual']    = 1
    factor['Bimensual']  = 2
    factor['Trimestral'] = 3
    factor['Semestral']  = 6
    factor['Anual']      = 12
```

El **equivalente anual** en centavos es:

```
valor_anual_centavos = valor_mensual_centavos * 12
```

### 8.2. Política de precisión

`decimal.js` se configura con:

```ts
// src/domain/precision/decimal.ts
import Decimal from 'decimal.js';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_EVEN });
// ROUND_HALF_EVEN = redondeo bancario (mitad al par)
// 28 dígitos: holgura para anualizar valores grandes sin perder precisión
```

**Regla**: todo cálculo intermedio usa `new Decimal(...)`. Solo al **presentar en UI** se aplica redondeo a 0 decimales (montos) o 2 decimales (porcentajes). Esto replica el comportamiento del Excel y la decisión del proposal.

### 8.3. Dónde vive la fórmula

`src/domain/normalizacion/mensualizar.ts`:

```ts
import Decimal from 'decimal.js';

const FACTORES: Record<Frecuencia, number> = {
  Mensual: 1,
  Bimensual: 2,
  Trimestral: 3,
  Semestral: 6,
  Anual: 12,
};

export function mensualizar(valorCentavos: number, frecuencia: Frecuencia): Decimal {
  return new Decimal(valorCentavos).div(FACTORES[frecuencia]);
}

export function anualizar(valorCentavos: number, frecuencia: Frecuencia): Decimal {
  return mensualizar(valorCentavos, frecuencia).mul(12);
}
```

**Por qué en TS y no en SQL**: porque la precisión de `decimal.js` (28 dígitos) es superior a la de `REAL`/`DOUBLE` de SQLite, y porque así el cálculo es testeable sin DB.

### 8.4. Interacción con `decimal.js`

- Las columnas de la DB son `INTEGER` (centavos exactos).
- En la frontera DB→memoria, los valores se convierten a `Decimal` antes de operar.
- En la frontera memoria→DB, los valores se redondean a entero (centavos) usando `ROUND_HALF_EVEN`.
- En la frontera memoria→UI, los valores se redondean a 0 decimales para mostrar y se formatean con separador de miles.

```ts
// Ejemplo de flujo: DB → memoria → cálculo → DB
const t: Transaccion = await db.get(id);                          // valor_centavos = 350000000
const mensual = mensualizar(t.valor_centavos, t.frecuencia);      // Decimal(116666666.66666666666666666666...)
const totalAnual = mensual.mul(12);                                // Decimal(1399999999.99999999999999999992)
const anualCentavos = totalAnual.toDecimalPlaces(0).toNumber();   // 1400000000 (redondeo bancario → par)
```

### 8.5. Verificación de cierre al centavo

Para validar contra el Excel:

| Caso | valor_base | frecuencia | mensual exacto Excel | mensual nuestro |
|------|------------|------------|----------------------|-----------------|
| 1 | 1,200,000 | Mensual | 1,200,000.000 | 1,200,000.000 ✓ |
| 2 | 300,000 | Bimensual | 150,000.000 | 150,000.000 ✓ |
| 3 | 3,500,000 | Trimestral | 1,166,666.667 | 1,166,666.667 ✓ |
| 4 | 6,000,000 | Semestral | 1,000,000.000 | 1,000,000.000 ✓ |
| 5 | 12,000,000 | Anual | 1,000,000.000 | 1,000,000.000 ✓ |

> Caso 3: `3500000 / 3 = 1166666.6666...`. El Excel lo muestra con 3 decimales (`1,166,666.667`). Nuestro motor, sin redondear, tiene los 28 dígitos exactos. Al presentar, redondeamos a 0 decimales → `1,166,667`. El golden test compara el valor en centavos redondeado: `116666667`. Esto se valida en `src/tests/golden/32_transacciones.golden.test.ts`.

---

## 9. Motor de cálculo de KPIs

### 9.1. Definiciones

```
INGRESOS_TOTALES_MENSUAL     = Σ valor_mensual(t)  para todo t con tipo_flujo='Ingreso'
GASTOS_NECESARIOS_MENSUAL    = Σ valor_mensual(t)  para todo t con tipo_flujo='Gasto' y naturaleza='Necesario'
GASTOS_VARIABLES_MENSUAL     = Σ valor_mensual(t)  para todo t con tipo_flujo='Gasto' y naturaleza∈{'No tan necesario','No necesario'}

FLUJO_DE_AHORRO_1  = INGRESOS_TOTALES_MENSUAL - GASTOS_NECESARIOS_MENSUAL
FLUJO_DE_AHORRO_2  = FLUJO_DE_AHORRO_1 - GASTOS_VARIABLES_MENSUAL
                    (= INGRESOS_TOTALES_MENSUAL - GASTOS_TOTALES_MENSUAL cuando salario objetivo=0)

CAPACIDAD_INVERSION = FLUJO_DE_AHORRO_2 - (salario_personal_objetivo if modo_mejorado_activo else 0)
```

### 9.2. Pseudocódigo

```ts
// src/domain/kpis/flujoAhorro1.ts

export function calcularFA1(transacciones: Transaccion[]): Decimal {
  return transacciones
    .filter(t => t.tipo_flujo === 'Ingreso')
    .reduce(
      (acc, t) => acc.plus(mensualizar(t.valor_centavos, t.frecuencia)),
      new Decimal(0),
    )
    .minus(
      transacciones
        .filter(t => t.tipo_flujo === 'Gasto' && t.naturaleza_necesidad === 'Necesario')
        .reduce(
          (acc, t) => acc.plus(mensualizar(t.valor_centavos, t.frecuencia)),
          new Decimal(0),
        ),
    );
}
```

```ts
// src/domain/kpis/flujoAhorro2.ts

export function calcularFA2(transacciones: Transaccion[]): Decimal {
  return calcularFA1(transacciones).minus(
    transacciones
      .filter(t =>
        t.tipo_flujo === 'Gasto' &&
        (t.naturaleza_necesidad === 'No tan necesario' ||
         t.naturaleza_necesidad === 'No necesario'),
      )
      .reduce(
        (acc, t) => acc.plus(mensualizar(t.valor_centavos, t.frecuencia)),
        new Decimal(0),
      ),
  );
}
```

```ts
// src/domain/kpis/capacidadInversion.ts

export function calcularCapacidadInversion(
  fa2: Decimal,
  salarioObjetivoCentavos: number,
  modoMejoradoActivo: boolean,
): Decimal {
  return modoMejoradoActivo
    ? fa2.minus(salarioObjetivoCentavos)
    : fa2;
}
```

### 9.3. Casos borde

| Caso | Comportamiento esperado |
|------|-------------------------|
| Sin transacciones | FA1=0, FA2=0, Cap.Inversión=0 (no negativo) |
| Solo ingresos, sin gastos | FA1 = FA2 = total ingresos, Cap.Inversión = FA2 (o FA2 - salario si modo mejorado) |
| Solo gastos | FA1 = -gastos_necesarios (negativo) |
| FA2 negativo y modo mejorado activo con salario > 0 | Cap.Inversión aún más negativo; se muestra en rojo |
| `salario_objetivo` mayor que FA2 positivo | Cap.Inversión negativo; tooltip explica que el salario se come el ahorro |
| Frecuencia = 0 → divisor inválido | Prevenido por CHECK (no se puede insertar) y por tipado TS |
| `valor_centavos` negativo | Prevenido por CHECK `> 0` y por validaciones del frontend |

### 9.4. Verificación contra Excel

Para el dataset de 32 transacciones:

- Ingresos totales mensual: **$7,200,000.00** (cierre al centavo contra `PRESUPUESTO!C12`)
- Gastos necesarios: **$5,060,000.00** (`PRESUPUESTO!C20`)
- Gastos variables: **$3,285,000.00** (`PRESUPUESTO!C24` total menos C20 = $8,345,000 - $5,060,000)
- FA1: **$2,140,000.00** (`ESTADO DE RESULTADOS!D14`)
- FA2 (inicial, sin descuento de salario): **-$1,145,000.00** (`ESTADO DE RESULTADOS!D21` con D16 vacío)
- Cap.Inversión (inicial): **-$1,145,000.00** (igual a FA2 porque no se descuenta salario)
- Cap.Inversión (mejorado, con salario $500,000): **+$925,000.00** (`ESTADO DE RESULTADOS!D23` con salario $500,000 → D21 - $500,000 = $1,425,000 - $500,000 = $925,000)

> **Cuidado**: el FA2 "mejorado" del Excel es el FA2 calculado sobre los valores del Simulador (no el FA1 menos el original). El motor nuestro lo calcula igual: el Presupuesto Mejorado es un `leftJoin` que reemplaza los valores No necesarios/No tan necesarios por los del Simulador, y el FA2 sobre ese nuevo set es el "mejorado". El descuento de salario se aplica aparte.

---

## 10. Panel Simulador

### 10.1. Filtro aislante de gastos no esenciales

Query Reactiva: el componente `PanelSimulador` consume `useTransaccionesStore` y filtra en cliente:

```ts
const gastosNoEsenciales = useMemo(
  () => transacciones.filter(
    t => t.tipo_flujo === 'Gasto' &&
         (t.naturaleza_necesidad === 'No necesario' ||
          t.naturaleza_necesidad === 'No tan necesario'),
  ),
  [transacciones],
);
```

Para el dataset de 32 transacciones esto da 12 filas (las listadas en REQ-401 §del spec).

### 10.2. Debounce de escritura

```ts
// src/hooks/useDebounce.ts

import { useEffect, useRef } from 'react';

export function useDebouncedEffect(
  fn: () => void,
  deps: unknown[],
  delayMs: number,
): void {
  const timer = useRef<number | null>(null);
  useEffect(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = window.setTimeout(fn, delayMs);
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, delayMs]);
}
```

Uso en `FilaSimulador`:

```ts
useDebouncedEffect(
  () => invoke('cmd_set_simulador', {
    transaccionId: t.id,
    nuevoValor: propuesto,
  }),
  [propuesto],
  300,
);
```

### 10.3. Flush-on-close

Dos caminos:

1. **WebView `beforeunload`** (vía JS): handler en `useFlushOnClose` que llama `invoke('cmd_flush_simulador', { entries })`. **Limitación**: en Tauri, el cierre de la ventana dispara `close-requested` antes de que `beforeunload` corra a tiempo.

2. **Tauri `tauri://close-requested`** (vía Rust): `on_window_event` en `lib.rs` intercepta el cierre, envía un evento `simulador:drain-request` al frontend, espera un ack `simulador:drained` con timeout de 2 s, y luego cierra.

```rust
// src-tauri/src/lib.rs (extracto)

use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // 1. abrir DB y correr migraciones
            // 2. guardar AppState en app.manage()
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let win = window.clone();
                // Pedir al frontend que drene el simulador
                win.emit("simulador:drain-request", ())?;
                // El frontend debe emitir "simulador:drained" y desde ahi llamamos window.close()
            }
        })
        .invoke_handler(tauri::generate_handler![ /* comandos */ ])
        .run(tauri::generate_context!())
        .expect("error al iniciar tauri");
}
```

```ts
// src/hooks/useFlushOnClose.ts

useEffect(() => {
  const off1 = listen('simulador:drain-request', async () => {
    const pending = useSimuladorStore.getState().drainPending();
    if (pending.length > 0) {
      await invoke('cmd_flush_simulador', {
        usuarioId: usePerfilStore.getState().activo!.id,
        entries: pending,
      });
    }
    emit('simulador:drained');
  });
  return () => { off1.then(fn => fn()); };
}, []);
```

> **Ver §17 riesgo R-NUEVO-2**: el ciclo `prevent_close → request → drain → close` agrega latencia al cierre. Si el usuario hace click en la X múltiples veces, podría ver la ventana "pegada". La mitigación: timeout duro de 2 s en Rust; si no llega el ack, cerrar igual.

### 10.4. Materialización del "left join" con la tabla Transacciones

```ts
// src/domain/agregaciones/leftJoinSimulador.ts

export function aplicarSimulador(
  transacciones: Transaccion[],
  propuestas: Map<number, number>,
): Transaccion[] {
  return transacciones.map(t => {
    const propuesta = propuestas.get(t.id);
    if (
      propuesta === undefined ||
      t.tipo_flujo !== 'Gasto' ||
      (t.naturaleza_necesidad !== 'No necesario' &&
       t.naturaleza_necesidad !== 'No tan necesario')
    ) {
      return t; // inmutable
    }
    return { ...t, valor_centavos: propuesta };
  });
}
```

> Por qué en TS y no en SQL: para mantener la lógica de cálculo en una sola capa testeable, y porque el Simulador vive como estado en memoria (no siempre en DB). El SQL solo guarda el `transaccion_id → nuevo_valor`; el join se materializa en cada lectura de Presupuesto Mejorado.

---

## 11. Sistema de migración de schema

### 11.1. Versionado

Cada migración tiene un `version` monotónicamente creciente (1, 2, 3, …). El runner lee `_migrations`, calcula el conjunto de versiones aplicadas, y aplica las que faltan en orden. La aplicación es **append-only**: nunca se borra un archivo `00N_*.sql` una vez mergeado a `main` (ver regla dura #3 en §19).

### 11.2. Patrón "expand → migrate → contract" para CHECK constraints

SQLite no tiene `ALTER TABLE … ALTER CONSTRAINT`. Para cambiar un CHECK constraint, la secuencia segura es:

1. **Expand**: crear la nueva tabla con el constraint nuevo (nombre diferente, ej: `_transacciones_v2`).
2. **Migrate**: `INSERT INTO _transacciones_v2 SELECT * FROM Transacciones WHERE …` (con cualquier transformación).
3. **Backfill** (si hace falta): correr un `UPDATE` para valores que no se copiaron.
4. **Contract**: en una migración posterior (puede ser la misma release, pero un archivo separado), `DROP TABLE Transacciones` y `RENAME _transacciones_v2 TO Transacciones`.
5. **Recreate índices y FKs**: los índices viven en `sqlite_master` y se recrean explícitamente.

```sql
-- 002_expandir_check_frecuencia.sql
CREATE TABLE _transacciones_v2 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    -- … mismas columnas …
    frecuencia TEXT NOT NULL CHECK (frecuencia IN (
        'Mensual','Bimensual','Trimestral','Semestral','Anual','Quincenal'
    )),
    -- …
);
INSERT INTO _transacciones_v2 SELECT * FROM Transacciones;

-- 003_contractar_check_frecuencia.sql
DROP TABLE Transacciones;
ALTER TABLE _transacciones_v2 RENAME TO Transacciones;
-- recrear índices aquí
```

### 11.3. Rollback strategy

No hay rollback automático. Si una migración falla a mitad, la transacción se aborta y la DB queda como estaba. Pero si la migración ya commiteó, **no se revierte automáticamente**. La rollback es manual:

1. Crear una migración `00N+1_rollback_00N.sql` que revierta los cambios.
2. Documentar en `docs/arquitectura/migraciones.md` por qué se necesitó el rollback.
3. Commitearla en una rama `fix/rollback-migration-00N` y mergear vía PR.

> **Política**: el runner aborta si el `sha256` del SQL de una migración ya aplicada cambia. Esto fuerza a crear una migración nueva en lugar de editar una vieja. Ver §6.6.

### 11.4. Reglas operativas

- Cada archivo de migración es **inmutable** una vez mergeado.
- Migrations tocan **solo DDL** (CREATE/ALTER/DROP/RENAME) y backfill de datos vía SQL puro. No hay lógica de aplicación.
- Migrations corren **dentro de una transacción** (SQLite lo permite para DDL en la mayoría de los casos; en casos de `ALTER TABLE` con RENAME no transaccional, se documenta).
- El archivo `migrations/000_bootstrap.sql` crea `_migrations` antes que cualquier otra.

---

## 12. Estrategia de tests

### 12.1. Pirámide

```
                          ┌────────────┐
                          │   E2E      │  (manual del usuario en esta fase)
                          ├────────────┤
                          │ Integración│  (Vitest + mocks del plugin sql)
                          ├────────────┤
                          │ Golden     │  (32_transacciones.json → KPIs)
                          ├────────────┤
                          │   Unit     │  (cálculos puros)
                          └────────────┘
```

### 12.2. Tests unitarios (Vitest)

- `src/domain/normalizacion/mensualizar.test.ts`: cada frecuencia con casos del spec (REQ-203).
- `src/domain/precision/decimal.test.ts`: drift, redondeo bancario, precisión.
- `src/domain/kpis/flujoAhorro1.test.ts`, `flujoAhorro2.test.ts`, `capacidadInversion.test.ts`.
- `src/domain/agregaciones/sumifs.test.ts`: replicar las SUMIFS del Excel.
- `src/domain/agregaciones/leftJoinSimulador.test.ts`: casos del spec (REQ-403).

### 12.3. Golden tests

`src/tests/golden/32_transacciones.golden.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import transacciones from '../../../scripts/fixtures/32_transacciones.json';
import { calcularFA1, calcularFA2 } from '../../domain/kpis';
import { Decimal } from 'decimal.js';

describe('Golden test: 32 transacciones del Excel', () => {
  it('replica FA1 = $2,140,000.00', () => {
    const fa1 = calcularFA1(transacciones);
    expect(fa1.toDecimalPlaces(0).toNumber()).toBe(214000000); // centavos
  });
  it('replica FA2 inicial = -$1,145,000.00', () => {
    const fa2 = calcularFA2(transacciones);
    expect(fa2.toDecimalPlaces(0).toNumber()).toBe(-114500000);
  });
});
```

### 12.4. Tests backend (cargo test)

- `src-tauri/src/db/migraciones.rs`: corrida de migraciones sobre una DB efímera en `/tmp/test.db`.
- `src-tauri/src/db/connection.rs`: integridad de FKs y PRAGMAs.
- `src-tauri/src/commands/transacciones.rs`: validación de input y aplicación de CHECKs (insertar frecuencia inválida debe fallar).

### 12.5. Comandos exactos para correr los tests (Windows)

Asumiendo `pnpm` instalado (si no, sustituir por `npm`):

```powershell
# 1. Tests unitarios y golden del frontend
cd C:\Users\hetan\Documents\desarrollo\opencode\mpv-app-financiera-v1
pnpm install
pnpm test                          # corre todos los *.test.ts
pnpm test:unit                     # solo unit
pnpm test:golden                   # solo golden

# 2. Build de producción del frontend
pnpm build

# 3. Tests del backend Rust
cd src-tauri
cargo test                         # corre cargo test
cargo test -- --nocapture          # con output de println visible
cargo test migraciones             # solo tests del módulo migraciones

# 4. Dev (Tauri abre la app en ventana)
cd ..
pnpm tauri dev

# 5. Build del instalador Windows (.msi)
pnpm tauri build

# 6. Verificar cobertura (opcional)
pnpm test -- --coverage
```

> **Nota Windows**: `pnpm tauri` requiere `cargo` y `rustc` en PATH. Si Tauri no encuentra las build tools de Microsoft (MSVC), instalar con `rustup default stable-x86_64-pc-windows-msvc` y Visual Studio Build Tools.

### 12.6. Pasos detallados para que el usuario valide localmente

1. Clonar el repo y abrir en la carpeta.
2. `pnpm install` en la raíz.
3. `pnpm test` → debe pasar verde.
4. `pnpm tauri dev` → debe abrir la ventana.
5. Crear un perfil, capturar 1 transacción de prueba, navegar a Presupuesto y Simulador.
6. `pnpm tauri build` → genera el instalador en `src-tauri/target/release/bundle/msi/`.
7. Verificar tamaño del instalador < 50 MB.

> El usuario corre los tests por su cuenta en cada etapa (regla dura #4). No se auto-aprueba.

---

## 13. Performance budget y mediciones

### 13.1. Budgets

| Métrica | Objetivo | Cómo se mide |
|---------|----------|--------------|
| Carga de 32 transacciones | < 100 ms (db.select → render inicial) | `performance.now()` en `useTransaccionesStore.cargar()` y en el `useEffect` que dispara el primer render del dashboard |
| Instalador Windows (.msi) | < 50 MB | Tamaño de archivo en `src-tauri/target/release/bundle/msi/` |
| RAM en reposo con 32 tx | < 200 MB | `Get-Process` en PowerShell tras 30 s de idle |
| Debounce del Simulador | ≤ 300 ms | `performance.now()` entre `onChange` y `invoke('cmd_set_simulador')` |
| Latencia de tipeo→render | < 50 ms | `performance.now()` en `FilaSimulador` |
| Cambio de perfil | < 1000 ms | `performance.now()` entre `seleccionar()` y render de la primera transacción del nuevo perfil |
| Migraciones | < 1 s en DB fresca | `cargo test` mide en `migraciones::ejecutar_pendientes` |

### 13.2. Cómo se mide cada uno

- **32 transacciones < 100 ms**: instrumentar `useTransaccionesStore.cargar()` con `console.time` y exponer el resultado vía telemetría opcional (no PII). En golden tests, esto se valida con un threshold en Vitest.
- **Instalador < 50 MB**: comando PowerShell `Get-Item …\bundle\msi\*.msi | Select Length`. Se compara contra 52428800 bytes.
- **RAM < 200 MB**: tras 30 s de inactividad, `Get-Process -Name "mvp-financiero" | Select WorkingSet64`.
- **Debounce ≤ 300 ms**: el hook `useDebouncedEffect` mide el delta y lo acumula en una métrica de dev.
- **Cambio de perfil < 1 s**: cubrir con un test de integración con `fake-indexeddb` o mock del plugin sql.

### 13.3. Herramientas

- **Frontend**: `performance.now()`, `performance.measure`, `PerformanceObserver` (devtools del WebView).
- **Backend**: `cargo bench` (opcional), `Instant::now()` en los handlers de comandos.
- **Tamaño de binario**: `cargo bloat --release` para entender qué contribute al peso.
- **RAM**: Task Manager / `Get-Process` en Windows.

---

## 14. Seguridad IPC y sandboxing

### 14.1. Capabilities declaradas

`src-tauri/capabilities/default.json`:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Capacidades mínimas del MVP Financiero Local-First",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "core:event:default",
    "core:window:default",
    "core:webview:default",
    "core:app:default",
    "sql:default",
    "sql:allow-execute",
    "sql:allow-select",
    "sql:allow-load"
  ]
}
```

> **No se incluyen** `fs:*`, `shell:*`, `http:*`, `os:*`, `dialog:*`, `clipboard:*`. Si en el futuro alguna HU los necesita, se documenta en una ADR y se agrega el permiso mínimo al capability file con justificación.

### 14.2. Auditoría XSS

- La UI usa React. Por defecto, React escapa contenido al renderizar (`{t.concepto}` → escapado). **Nunca** usar `dangerouslySetInnerHTML` con datos del usuario.
- Los gráficos Recharts no interpretan HTML, solo SVG; las etiquetas son `string` puros.
- Los inputs de tipo numérico validan con `Number()` y con `Decimal`; nunca se hace `eval` ni `new Function` con input del usuario.
- El concepto de transacción es `string` y se renderiza con `{t.concepto}`. Inyectar `<script>alert(1)</script>` en concepto produce texto visible, no ejecución.

### 14.3. Política de bind values

**Regla**: toda query SQL que tome datos del usuario usa `?` (bind values posicionales). Nunca interpolación de strings.

```ts
// CORRECTO
await db.execute(
  'INSERT INTO Transacciones (usuario_id, tipo_flujo, concepto, valor_centavos) VALUES (?, ?, ?, ?)',
  [usuarioId, 'Gasto', concepto, valorCentavos],
);

// PROHIBIDO
await db.execute(
  `INSERT INTO Transacciones (concepto) VALUES ('${concepto}')`,
);
```

> Riesgo cubierto: el plugin `tauri-plugin-sql` ya envía todo por el canal IPC tipado, pero igualmente la convención se aplica en cada repositorio por defensa en profundidad.

### 14.4. Validación de input

- **Frontend**: cada `TransaccionInput` se valida con un schema (Zod o yup) antes de invocar el comando. Errores de validación se muestran inline, no viajan al backend.
- **Backend (Rust)**: cada comando re-valida los argumentos con sus propios tipos. Si el frontend omite la validación, el backend igual rechaza input inválido. Esto es defensa en profundidad.

---

## 15. Multi-perfil

### 15.1. Selector al abrir

- En el primer arranque: `Usuarios` está vacía. La app renderiza un único componente `<PantallaCrearPerfil />` (full-screen modal). El usuario tipea un nombre y hace click en "Crear". El comando `cmd_crear_usuario` lo inserta y lo marca como activo.
- En arranques subsiguientes: si hay al menos 1 usuario, la app renderiza `<SelectorPerfil />` (full-screen). El usuario elige uno o crea uno nuevo. Hasta seleccionar, no se monta la app principal.
- **No hay bypass**: si el usuario cierra el modal sin elegir, la app no carga datos.

### 15.2. Aislamiento por query

- `usePerfilStore.activo` expone `{ id, nombre, ... }`. Su id se pasa a cada repositorio.
- `transacciones.repo.listar(usuarioId)` siempre filtra por `usuario_id = :id`. No hay endpoint que liste sin filtro.
- `simulador.repo.cargar(usuarioId)` igual.
- El frontend **nunca** mantiene transacciones de un perfil inactivo en memoria entre cambios (al cambiar de perfil, los stores se limpian).

### 15.3. Cambio de perfil en vivo

```ts
// usePerfilStore.seleccionar
async seleccionar(id: number) {
  this.cargando = true;
  const u = await invoke<PerfilActivo>('cmd_obtener_usuario', { id });
  this.activo = u;
  // Limpiar todos los stores para evitar datos cruzados
  useTransaccionesStore.getState().reset();
  useSimuladorStore.getState().limpiar();
  // Recargar desde el nuevo perfil
  await useTransaccionesStore.getState().cargar(id);
  await useSimuladorStore.getState().cargar(id);
  this.cargando = false;
}
```

### 15.4. Migración de datos previos (si ya existía v0 con un solo perfil)

> **Esta sección aplica solo si el usuario tenía una versión previa de la app sin multi-perfil.** En el MVP inicial no aplica, pero se documenta para que un día la decisión esté tomada.

- El archivo de DB existente no tiene columna `usuario_id` en `Transacciones`/`Simulador` ni columna `salario_personal_objetivo_centavos` en `Usuarios`. El plan es:
  1. Crear un usuario por defecto "Personal" con id=1.
  2. Migración que agrega `usuario_id` a `Transacciones` con default 1 y `NOT NULL` después del backfill.
  3. Migración análoga para `Simulador`.
  4. Migración que agrega `salario_personal_objetivo_centavos` y `modo_mejorado_activo` a `Usuarios`.
- Patrón: **expand → migrate → contract** (ver §11.2).

---

## 16. Manejo de errores y observabilidad

### 16.1. Qué se loguea

| Origen | Nivel | Contenido | Dónde |
|--------|-------|-----------|-------|
| Frontend | `error` | Excepciones JS no atrapadas, fallos de `invoke` | Consola del WebView (devtools) |
| Frontend | `warn` | Validaciones de input fallidas, retries del debounce | Consola |
| Backend | `info` | Inicio de la app, carga de DB, migraciones aplicadas, perfil activo | Archivo `logs/app.log` (Tauri) |
| Backend | `error` | Errores de DB, fallos de IPC, CHECK constraint violations | `logs/app.log` |
| Backend | `warn` | Migraciones con drift de sha256, queries lentas | `logs/app.log` |

### 16.2. Formato

JSON lines (una línea por evento):

```json
{"ts":1719859200,"level":"info","src":"rust","msg":"migraciones aplicadas","version":1,"sha":"abc123…"}
{"ts":1719859210,"level":"error","src":"rust","msg":"CHECK constraint violated","kind":"check","column":"frecuencia","value":"Quincenal"}
{"ts":1719859220,"level":"warn","src":"ts","msg":"debounce retry","transaccion_id":12,"attempts":2}
```

### 16.3. Qué se expone al usuario

- Errores de validación: inline en el formulario.
- Errores de CHECK constraint: mensaje en español neutro: "El valor 'Quincenal' no es válido para el campo Frecuencia. Valores permitidos: Mensual, Bimensual, Trimestral, Semestral, Anual."
- Errores de DB graves: modal con texto corto y código de error (para que el usuario lo reporte).
- **Nunca** se exponen stack traces al usuario en producción.

### 16.4. Telemetría

**No hay telemetría**. El PRD exige local-first. No se envía ningún dato fuera del dispositivo. La app no hace llamadas de red. Esto se valida con un test que intercepta `fetch` y `XMLHttpRequest` y verifica que no se invoquen nunca.

---

## 17. Riesgos de implementación

| # | Riesgo | Probabilidad | Impacto | Mitigación |
|---|--------|--------------|---------|------------|
| 1 | Pérdida de cambios en el Simulador si se cierra la app durante el debounce | Media | Alto | `tauri://close-requested` + drain pattern (§10.3). Persistir también en `blur` del input. |
| 2 | Drift en anualización `×12` cuando el equivalente mensual tiene fracciones de centavo | Alta | Medio | `decimal.js` con `ROUND_HALF_EVEN` y precisión 28. Tests de regresión contra el Excel. |
| 3 | Migración futura a multi-moneda requiere alterar schema | Baja | Alto | Columna `moneda` ya reservada en v1 con CHECK `('LOCAL')`. Plan documentado. |
| 4 | Cierre al centavo pero fixtures del Excel tienen 3 decimales | Alta | Medio | Golden tests comparan valor mensual **normalizado** (28 dígitos) y valor UI (0/2 decimales por separado). |
| 5 | Persistencia del equivalente mensual: ¿recalcular o cachear? | Media | Medio | Recalcular siempre desde `Transacciones`. Ninguna columna calculada persiste. |
| 6 | Compatibilidad cross-platform Tauri v2 | Baja | Bajo | Roadmap post-MVP. v1 es Windows. |
| 7 | Migración de CHECK constraints en SQLite | Media | Alto | Patrón expand → migrate → contract documentado en §11.2. |
| 8 | Contaminación cruzada por `naturaleza_necesidad` en Ingreso | Media | Alto | CHECK cruzado a nivel SQL. Validación adicional en la capa de aplicación. |
| 9 | UX del modo "Mejorado" no comunica el cambio de comportamiento | Media | Medio | Tooltip + banner persistente cuando `modo_mejorado_activo = true`. |
| **R-NUEVO-1** | `tauri-plugin-sql` puede cambiar de API entre versiones | Baja | Alto | Pin de versión exacta en `Cargo.toml` y `package.json`. Revisar CHANGELOG antes de actualizar. |
| **R-NUEVO-2** | Ciclo `prevent_close → drain → close` agrega latencia perceptible al cierre | Media | Bajo | Timeout duro de 2 s en Rust. Si no llega `simulador:drained`, cerrar igual. |
| **R-NUEVO-3** | Port futuro a SQLite-via-WASM (sql.js) podría perder transacciones si no se sincroniza | Baja | Alto | Documentado en ADR `0004-futuro-sqlite-wasm.md` (no creado en v1). El MVP es 100% nativo vía `tauri-plugin-sql`. |
| **R-NUEVO-4** | Si el usuario edita `misfinanzas.db` externamente (borrando una categoría con FK), la próxima lectura falla | Baja | Medio | `PRAGMA foreign_keys = ON` + `ON DELETE RESTRICT` en `categoria_id`. Mensaje de error claro al usuario. |
| **R-NUEVO-5** | `vitest` corre en jsdom, no en WebView; algunas APIs de Tauri no se pueden mockear fácilmente | Media | Medio | Separar tests de dominio (sin Tauri) de tests de integración (con `tauri-plugin-sql-mock` o similar). |
| **R-NUEVO-6** | Conventional Commits exige scope y descripción en español; en la práctica cuesta mantenerlo | Baja | Bajo | Template de commit en `.gitmessage` o CONTRIBUTING. El linter (`commitlint`) lo enforza. |
| **R-NUEVO-7** | Chained PRs: si una épica excede 400 líneas de diff, dividir y rebasear puede ser costoso | Media | Medio | Estrategia documentada en §13. Empezar la épica planeando slices. Forecast en `tasks.md`. |
| **R-NUEVO-8** | Trigger de `updated_at` se rompe si SQLite no lo tiene habilitado (sí lo tiene, pero documentar) | Baja | Bajo | Test explícito en `migraciones::ejecutar_pendientes` que crea un trigger dummy y verifica que se dispara. |

---

## 18. Decisiones técnicas que requieren confirmación

Estas decisiones técnicas, aunque alineadas con el proposal, conviene que el usuario las confirme explícitamente antes de pasar a `sdd-tasks`. Si las das por aprobadas sin preguntar, registramos un cambio de scope silencioso, y eso va contra la regla dura #4.

1. **`tauri-plugin-sql` como plugin oficial vs. rusqlite directo expuesto por un comando custom**. La opción A es más rápida de integrar y mantiene tipado. La opción B da control total sobre el pool y los PRAGMAs. **Recomendación**: opción A para v1, refactor a opción B si la performance no alcanza. **¿OK?**
2. **Triggers de `updated_at` vs. setear desde la app**. Recomendamos triggers (ver §5.7) para que el backend no se olvide nunca. **¿OK con triggers?**
3. **Sembrado de 14 categorías fijas en la migración inicial vs. sembrado desde un script Node post-migración**. La opción A es atómica (todo en una transacción SQL); la opción B permite editar las categorías sin tocar migraciones. **Recomendación**: A. **¿OK?**
4. **Resolución de Cents a Decimal**: usar `new Decimal(valorCentavos)` con `valorCentavos: number` (entero JS). Como los valores vienen de SQLite `INTEGER` (hasta 2^53 seguros), no hay riesgo de precisión hasta que el usuario ingrese > $90 billones. **Documentamos como riesgo latente y seguimos así. ¿OK?**
5. **Tabs vs. router de URL**. Recomendamos tabs sin URL (más simple, la app es local). **¿OK?**
6. **Mock del plugin sql en tests de integración vs. tests con DB SQLite en /tmp**. La opción A es más rápida pero menos fiel. La opción B requiere levantar SQLite en CI. **Recomendación**: A para unit/integración, B solo para golden tests end-to-end. **¿OK?**
7. **Política de versionado de schema y renombrado de migraciones**: si se commitea una migración mala, ¿se crea una nueva que la corrige, o se hace force-push al commit anterior? **Recomendación**: nunca force-push a `main`; siempre crear nueva migración. **¿OK?**
8. **Idioma del `commitlint` config y de los mensajes de error de la app**: español neutro para UI y commits; inglés para logs internos de Rust (`tracing` o similar). **¿OK?**

> Si alguna respuesta es "no" o "cambiar", se reabre la conversación antes de avanzar a `sdd-tasks`.

---

## 19. Reglas duras del usuario (recordatorio inmutable)

Estas reglas fueron impuestas por el usuario y son **inmutables** a lo largo de todas las fases de SDD. Se reiteran aquí para que queden explícitas en el diseño, y cualquier agente posterior (apply, verify, archive) debe respetarlas.

1. **Toda feature se realiza en ramas**. No commits directos a `main` ni a `master`. Cada HU/épica tiene su propia rama. Estrategia detallada en §3.
2. **Conventional Commits**. Mensajes con formato `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:` (también `perf:`, `build:`, `ci:`). Scope y descripción en **español neutro**. Detalles y ejemplos en §3.2.
3. **No borrar nada sin consentimiento explícito**. Cualquier `git rm`, `rm`, drop de schema (`DROP TABLE`), eliminación de archivo del proyecto, o archivo de migración → STOP and ASK antes. Esto incluye:
   - `git rm` o `rm` de cualquier archivo.
   - `DROP TABLE`, `DROP INDEX`, `DROP TRIGGER` en migraciones.
   - `DELETE FROM` sobre la DB de un usuario (no aplica: nunca tocamos la DB del usuario en código de la app).
   - Cambios destructivos en `migrations/00N_*.sql` una vez mergeado.
   - Cambios de masa en `package.json`, `Cargo.toml`, `tsconfig.json` que eliminen deps.
   - Reseteo de `misfinanzas.db` o de cualquier fixture.
4. **El usuario revisa y corre tests por su cuenta en cada etapa**. No se skipean pausas interactivas. No se auto-aprueban fases. La fase apply espera confirmación explícita del usuario antes de merge de cada PR. La fase verify presenta resultados pero el usuario decide si cierra la HU.

> Estas reglas viven en este `design.md` y se replican en el README del proyecto y en `CONTRIBUTING.md` cuando se cree.

---

## 20. Referencias cruzadas

| Tema | Documento |
|------|-----------|
| Qué se construye (alcance) | `proposal.md` §5 |
| Requisitos formales (escenarios) | `spec.md` (19 REQ, 38 escenarios) |
| Análisis del Excel | `docs/analisis-plantilla-financiera.md` |
| Decisiones de producto bloqueadas | `proposal.md` §3, `explore.md` §2 |
| Riesgo y mitigaciones (de producto) | `proposal.md` §8 |
| 32 transacciones como fixture | `scripts/fixtures/32_transacciones.json` (lo genera `scripts/generar_analisis_md.py`) |
| KPIs esperados | `scripts/fixtures/kpis_esperados.json` (a crear en apply con valores del spec) |
| Estructura final del proyecto | §4 de este design |
| Branching + commits | §3 de este design |
| Comandos IPC (firmas) | §6.2 de este design |
| DDL completo | §5 de este design |
| Pseudocódigo de KPIs | §9 de este design |
| Política de redondeo | §8.2 de este design |

---

_Fin del diseño. Listo para `sdd-tasks`._
