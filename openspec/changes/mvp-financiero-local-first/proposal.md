# Propuesta: MVP Financiero Local-First

> **Trazabilidad**: las decisiones y el análisis previo viven en `openspec/changes/mvp-financiero-local-first/explore.md`. El análisis cuantitativo del Excel fuente está en `docs/analisis-plantilla-financiera.md`. Esta propuesta consolida ambos y bloquea el alcance para la fase de especificación.

## 1. Resumen ejecutivo

Construimos una **aplicación de escritorio local-first** que replica, con fidelidad al centavo, el motor de cálculo financiero del Excel de diagnóstico personal. La aplicación es para una persona física que hoy gestiona su presupuesto en una hoja de cálculo y quiere los mismos números, sin errores de punto flotante, sin macros frágiles y con un panel interactivo de simulación tipo "qué pasaría si reduzco restaurantes". Todo el cómputo ocurre en el dispositivo del usuario: no hay servidor, no hay nube, no hay telemetría.

La pieza diferencial es el **Simulador de Oportunidades**: un panel donde el usuario propone nuevos montos mensuales para sus gastos no esenciales y ve, en tiempo real, cómo cambian su Flujo de Caja Libre, su Capacidad de Inversión y su ahorro anual. En el caso base del Excel (32 transacciones, 6 ingresos + 26 gastos), pasar de un flujo inicial de **-$1,145,000/mes** a una capacidad de inversión de **+$925,000/mes** es exactamente lo que el motor replica.

La app **no** es una plataforma de inversión, no es una herramienta colaborativa, no sincroniza entre dispositivos, no se integra con bancos por Open Finance y no es un sistema contable de propósito general. Está enfocada al diagnóstico personal: el usuario introduce sus números, entiende su situación y decide qué gastos quiere atacar. El MVP entrega las 5 fases del PRD (arquitectura, captura, presupuesto, simulación, estado de resultados) con criterio de cierre al centavo.

La promesa concreta al usuario: **lo que ves en pantalla cierra al centavo contra el Excel fuente**, no se rompe con decimales binarios, y los cambios en el simulador se reflejan al instante sin recargar.

## 2. Problema y motivación

El usuario opera hoy un Excel de 5 hojas, ~5,300 celdas activas y ~4,700 fórmulas, donde la fuente de verdad es `MIS FINANZAS` y todas las demás hojas son agregaciones SUMIFS que dependen de columnas espejo calculadas a mano. Esa arquitectura arrastra tres problemas estructurales.

Primero, **fragilidad ante edición**: cualquier cambio en una frecuencia (de "Trimestral" a "Mensual") o un valor mal tipeado en una columna espejo desincroniza el modelo entero sin señal de error visible. El archivo tiene cero errores en sus fórmulas, pero esa limpieza es el resultado de una disciplina manual que no escala.

Segundo, **imposibilidad de simular sin destruir datos**: el panel de simulación vive en la misma planilla que los datos reales. Probar "qué tal si bajo restaurantes a $200,000" requiere editar celdas adyacentes y confiar en que uno revertirá los cambios. La promesa de un flujo "mejorado" coexiste con el riesgo real de contaminar el flujo base.

Tercero, **precisión flotante del entorno**: el Excel evita el problema almacenando números decimales binarios que se acumulan en `1,166,666.667`. Una migración a un sistema en JavaScript sin disciplina matemática introduciría `0.30000000000000004`-style drift en cada agregación cruzada, invalidando la confianza en cualquier cálculo de Capacidad de Inversión.

La migración a una app local-first resuelve los tres: tipado estricto en las frecuencias y naturalezas, separación limpia entre datos reales y simulados, y aritmética decimal exacta hasta la presentación.

## 3. Decisiones bloqueadas

Estas 6 decisiones son **inmutables** para las fases de especificación, diseño, tareas e implementación. Cualquier reversión requiere reabrir la conversación con el orquestador.

| #   | Decisión                                     | Detalle                                                                                                                                                                                               |
| --- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Idioma de la UI**                          | Español neutro LATAM sin voseo. Textos formales con "tú", sin modismos regionales. Sin selector de locale en v1.                                                                                      |
| 2   | **Salario Personal Objetivo en FA2 inicial** | NO se descuenta al inicio. `D16` del Estado de Resultados Inicial queda vacío. Resultado: **-$1,145,000**. El salario se configura al activar el modo "Mejorado" y se deduce desde entonces.          |
| 3   | **Librería de gráficos**                     | Recharts. Peso objetivo ~100KB gzipped, integración React-native, suficiente para barras/torta/distribución porcentual que pide la HU-302.                                                            |
| 4   | **Validación de enums**                      | CHECK constraints en SQL dentro de las migraciones de Tauri. Toda adición o modificación de un enum exige un plan de migración de schema documentado antes de ejecutar la migración.                  |
| 5   | **Límite duro de transacciones**             | Sin límite duro. SQLite aguanta el orden de magnitud esperado. La UI implementa scroll virtualizado y/o paginación cuando la lista crece más allá de un umbral de UX (definido en la fase de diseño). |
| 6   | **Soporte multi-usuario**                    | Múltiples perfiles en la misma DB. Al abrir la app, un selector de perfil obligatorio en primera ejecución; el usuario activo filtra todas las consultas. Cambiar de perfil no es destructivo.        |

## 4. Stack propuesto

| Capa            | Tecnología                                  | Justificación corta                                                                         |
| --------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Contenedor      | Tauri v2 (Rust)                             | ~58% menos RAM y ~96% menos bundle que Electron. IPC con sandboxing por capacidades.        |
| Frontend        | React 18 + TypeScript + Vite                | SPA tipada; Vite para DX rápida en `tauri dev`.                                             |
| Estilos         | TailwindCSS                                 | Utility-first, sin lock-in visual, coherente con el tono técnico del producto.              |
| Estado          | Zustand                                     | Bajo boilerplate, tipado fuerte, suficiente para el modelo reactivo del MVP.                |
| Backend (datos) | Tauri v2 + `tauri-plugin-sql`               | Driver SQLite embebido, sin procesos externos, API JS tipada.                               |
| Persistencia    | SQLite                                      | Archivo único en `BaseDirectory::App`, columnas monetarias como `INTEGER` (centavos Int64). |
| Matemáticas     | `decimal.js`                                | Operaciones con precisión arbitraria, redondeo bancario, sin IEEE 754 drift.                |
| Gráficos        | Recharts                                    | Decisión bloqueada #3. SVG-based, declarativo, compatible con paleta del dashboard.         |
| Migraciones     | `MigrationKind::Up` en Rust                 | Sistema versionado nativo del plugin SQL.                                                   |
| Tests frontend  | Vitest + golden tests contra Excel          | Cierre al centavo contra fixtures del archivo fuente.                                       |
| Tests backend   | `cargo test` para migraciones y constraints | Garantiza que CHECK y migraciones aplican correctamente.                                    |

**Flujo de datos**: input del usuario → store Zustand → debounce de escritura → `db.execute` con bind values → SQLite. Lecturas: `db.select` → normalización temporal en memoria con `decimal.js` → estado derivado → render en React/Recharts.

## 5. Alcance del MVP

### Dentro del alcance

- 5 hojas lógicas implementadas como pestañas: Mis Finanzas (captura), Presupuesto, Oportunidades de Mejora, Presupuesto Mejorado, Estado de Resultados.
- Motor de normalización temporal exacto: `valor_mensual = valor_base / {1, 2, 3, 6, 12}` para `Mensual`, `Bimensual`, `Trimestral`, `Semestral`, `Anual`. Anualización `× 12`.
- Cálculo de los 3 KPIs terminales: Flujo de Ahorro 1, Flujo de Ahorro 2, Capacidad de Inversión. Réplica exacta de los valores del Excel sobre el dataset de 32 transacciones (cierre al centavo contra `PRESUPUESTO!F12`, `F24`, `F27`, `ESTADO DE RESULTADOS!D14`, `D21`, `D23`, `H14`, `H21`, `H23`).
- Panel de simulación interactivo con debounce y persistencia automática por fila.
- Soporte multi-perfil con selector al abrir la app.
- Persistencia local en SQLite con archivo en `BaseDirectory::App`.
- Migraciones versionadas, incluido el plan para alterar CHECK constraints.
- Esquema de tipado fuerte con `tipo_flujo` explícito (el Excel lo infería por columna; el MVP lo materializa para evitar contaminación cruzada en SUMIFS).
- Verificación de cierre al centavo mediante golden tests con las 32 transacciones del Excel como fixture.

### Fuera del alcance

- Sincronización en la nube, cuentas de usuario remotas, multi-dispositivo.
- Integración con bancos o feeds Open Finance.
- Soporte de monedas distintas a la local (se documenta como riesgo de migración futura, pero no se implementa).
- Edición concurrente multi-usuario en la misma sesión.
- Modo oscuro, accesibilidad ampliada (WCAG AA), internacionalización.
- Exportación/importación a Excel, CSV, PDF.
- Notificaciones push, recordatorios, automatización de tareas.
- Modificación del Excel fuente; el MVP solo lo lee como referencia para golden tests.

## 6. Épicas del Product Backlog

Las 5 épicas siguen el orden temporal del PRD y se traducen al backlog de implementación. Cada épica cierra con un demo verificable.

### Épica 1 — Arquitectura de persistencia y puentes (Semanas 1–2)

**Objetivo**: dejar en pie el entorno híbrido Tauri + React + SQLite, con migraciones versionadas y las 4 tablas (`Usuarios`, `Categorias`, `Transacciones`, `Simulador`) creadas en el primer arranque.

- **HU-101** Inicialización del entorno Tauri-React. Compila `tauri dev`. IPC aislado del WebView. TailwindCSS y `decimal.js` instalados.
- **HU-102** Integración de `tauri-plugin-sql`. Cargo feature `sqlite`. Capabilities `sql:default`, `sql:allow-execute`, `sql:allow-select`. DB en `BaseDirectory::App`.
- **HU-103** Migraciones versionadas y esquema inicial. `CREATE TABLE IF NOT EXISTS` con tipos `INTEGER` de 64 bits para montos, CHECK constraints para enums.

### Épica 2 — Captura transaccional y CRUD (Semanas 3–4)

**Objetivo**: que el usuario introduzca sus 32 transacciones (o el subconjunto real de su caso) con la granularidad del Excel y vea los equivalentes mensuales calculados.

- **HU-201** Sembrado de metadatos maestros. Categorías precargadas vía script. Selects dependientes por tipo de flujo.
- **HU-202** Captura interactiva de flujos. Inputs numéricos formateados. Multiplicación por 100 antes de persistir. Bind values posicionales.
- **HU-203** Motor predictivo de normalización temporal. Contexto reactivo (`db.select`) que aplica los divisores por frecuencia. Preservación de precisión completa en RAM.

### Épica 3 — Dashboard y Presupuesto (Semanas 5–7)

**Objetivo**: matriz comparativa mensual/anual cruzada por categoría y naturaleza, con gráficos de distribución porcentual.

- **HU-301** Matriz SUMIFS virtual. Cruce categoría × comportamiento / naturaleza. Subtotales y totales replicando `PRESUPUESTO!C8:J24`.
- **HU-302** Gráficos Recharts. Distribución porcentual de gastos e ingresos. Tortas y barras, paleta consistente.

### Épica 4 — Simulador de oportunidades (Semanas 8–10)

**Objetivo**: panel interactivo de los 12 gastos no esenciales con recálculo en vivo.

- **HU-401** Filtro aislante de superficialidad. Lista solo `No necesario` y `No tan necesario`. Tabla compacta con `actual` vs `propuesto`.
- **HU-402** Recálculo instintivo con debounce. OnChange dispara escritura `INSERT OR REPLACE` en `Simulador`. Visualización instantánea de `Total Gastos Variables` y `Ahorro Año`.
- **HU-403** Matriz mejorada (clon + reemplazo). Algoritmo de left join sobre `Transacciones` y `Simulador`. Gastos fijos e ingresos quedan inmutables.

### Épica 5 — Estado de Resultados y métricas resolutivas (Semanas 11–12)

**Objetivo**: el cierre del flujo. Comparativa dual Inicial vs Mejorado con los 3 KPIs.

- **HU-501** Visualizador dual. Tabla estilo estado de resultados. Colores por signo del KPI (verde ≥ 0, rojo < 0).
- **HU-502** Salario Personal Objetivo configurable. Modal de configuración. Activación del modo "Mejorado". Capacidad de Inversión positiva renderizada en verde.

## 7. Métricas de éxito

Estas métricas son **medibles** y se verifican antes de cerrar el cambio.

- **Cierre al centavo en golden tests**: 100% de los 32 registros del Excel replican los valores de `PRESUPUESTO!F12`, `F24`, `F27`, `ESTADO DE RESULTADOS!D14`, `D21`, `D23`, `H14`, `H21`, `H23`. Tolerancia: $0.00.
- **Instalador < 50 MB**: el binario empaquetado (`.msi` Windows para v1) no supera los 50 MB, alineado con el beneficio Tauri sobre Electron.
- **Consumo de RAM < 200 MB** en estado de reposo tras cargar el dataset base de 32 transacciones.
- **Carga de 32 transacciones en < 100 ms** desde `db.select` hasta render del dashboard inicial (medido en `cargo tauri dev` y en release).
- **Debounce del simulador ≤ 300 ms** entre cambio del input y persistencia en SQLite, sin pérdida de edición ante cierre forzoso de la app (flush on app close obligatorio).
- **0 vulnerabilidades críticas** en auditoría de IPC: payloads XSS inyectados en campos de concepto no acceden al sistema de archivos ni ejecutan Rust code.
- **Build reproducible**: `cargo tauri build` produce un instalador idéntico byte a byte en runs consecutivos desde el mismo commit.
- **Validación de CHECK constraints**: insertar una frecuencia fuera del conjunto `{Mensual, Bimensual, Trimestral, Semestral, Anual}` falla con error SQL antes de tocar el modelo.
- **Selector de perfil funcional**: cambiar de perfil en menos de 1 segundo, con aislamiento completo de las transacciones del perfil anterior.

## 8. Riesgos y mitigaciones

| #   | Riesgo                                                                                                                                 | Probabilidad | Impacto | Mitigación                                                                                                                                                                        |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Pérdida de cambios en el Simulador si se cierra la app durante el debounce                                                             | Media        | Alto    | Implementar flush on app close (`beforeunload` + handler en Tauri que drena el store antes de salir). Persistir también en eventos `blur` del input.                              |
| 2   | Drift en anualización `× 12` cuando el equivalente mensual tiene fracciones de centavo (ej. `1,166,666.667`)                           | Alta         | Medio   | Usar `decimal.js` con `rounding: decimal.ROUND_HALF_EVEN` (banquero) y precisión ≥ 28 dígitos. Documentar la política de redondeo en el spec.                                     |
| 3   | Migración futura a multi-moneda requiere alterar el schema sin perder histórico                                                        | Baja         | Alto    | Reservar columna `moneda` (default `LOCAL`) desde v1 aunque el MVP no la use. Definir el plan de migración de CHECK cuando se abra el caso multi-moneda.                          |
| 4   | El QA exige cierre al centavo pero los fixtures del Excel tienen precisión de 3 decimales (`1,166,666.667`)                            | Alta         | Medio   | Golden tests comparan valor mensual normalizado (sin redondear) y valor UI (con redondeo a 0 o 2 decimales). Documentar la política: backend preciso, UI presentación redondeada. |
| 5   | Persistencia del equivalente mensual: ¿recalcular en cada render (correcto, costoso) o cachear en vista SQL (rápido, riesgo de drift)? | Media        | Medio   | Decisión: recalcular en cada lectura desde la tabla fuente. La tabla `Transacciones` es la única fuente de verdad. Ninguna columna calculada persiste.                            |
| 6   | Compatibilidad cross-platform de Tauri v2 (Windows target en v1, macOS/Linux roadmap)                                                  | Baja         | Bajo    | Roadmap explícito post-MVP. La decisión no bloquea el alcance actual.                                                                                                             |
| 7   | Migración de CHECK constraints en SQLite requiere reescribir la tabla                                                                  | Media        | Alto    | Documentar el patrón "expand → migrate → contract" desde la primera migración. Cualquier cambio futuro a un CHECK va por ese flujo y queda en `openspec/changes/`.                |
| 8   | Contaminación cruzada por `naturaleza_necesidad` mal aplicada a un Ingreso (riesgo detectado en el análisis del Excel)                 | Media        | Alto    | CHECK constraint `CHECK (tipo_flujo = 'Gasto' OR naturaleza_necesidad IS NULL)` a nivel SQL. Validación adicional en la capa de aplicación.                                       |
| 9   | UX del modo "Mejorado" no comunica claramente que cambia el comportamiento del FA2                                                     | Media        | Medio   | Tooltip explícito al activar el modo. Banner persistente mientras esté activo. Documentación en el flujo de onboarding.                                                           |

## 9. Preguntas abiertas resueltas

Las dos preguntas abiertas que el `explore.md` defería a esta fase quedaron resueltas y constan como decisiones bloqueadas #5 y #6. Detalle en `openspec/changes/mvp-financiero-local-first/explore.md` §6 y el sustento de cada respuesta está en `docs/analisis-plantilla-financiera.md` §6 (discrepancias materiales del Excel) y §5 (reglas de negocio extraídas).

## 10. Referencias

- **PRD**: `MVP-Financiero-Local_ Tecnologías-y-SCRUM.md`
- **Análisis técnico del Excel fuente**: `docs/analisis-plantilla-financiera.md`
- **Exploración previa**: `openspec/changes/mvp-financiero-local-first/explore.md`
- **Plantilla fuente**: `docs/Plantilla-diagnóstico-financiero-(Ejemplo).xlsx`

---

## 11. Estado de cierre

Esta propuesta fue implementada en 6 slices (Épicas 1 a 5) y cerrada como MVP el **2026-07-04**. Cierre al centavo contra el Excel fuente con 127 tests verde (74 frontend + 53 backend). Ver [`MVP-COMPLETE.md`](./MVP-COMPLETE.md) para el resumen ejecutivo, las métricas de cierre y las release notes por historia de usuario.
