# Exploración: mvp-financiero-local-first

## 1. Resumen Ejecutivo

Este documento captura la exploración realizada durante la fase `sdd-explore` para el cambio `mvp-financiero-local-first`. Se documentan las decisiones bloqueadas (respuestas del usuario a las 4 preguntas de producto), el stack tecnológico propuesto, los enfoques alternativos considerados, los riesgos identificados y las preguntas abiertas que se deferirán a la fase de propuesta.

**¿Qué es el proyecto?**  
Una aplicación de escritorio local-first para diagnóstico financiero y gestión de presupuesto personal. Permite crear diagnósticos financieros, gestionar ingresos y gastos por categoría, y analizar la capacidad de ahorro usando las mismas fórmulas que la plantilla Excel de referencia.

**¿Qué NO es el proyecto?**

- Aplicación con sincronización en la nube o multi-dispositivo
- Herramienta colaborativa en tiempo real
- Plataforma de inversión o trading
- Integración con bancos (sin feeds de lectura)
- Sistema contable de propósito general (enfocado en diagnóstico de presupuesto personal)

---

## 2. Decisiones Bloqueadas

Las siguientes decisiones fueron tomadas por el usuario durante la fase de exploración y se consideran **bloqueadas** para las fases posteriores:

| #   | Decisión                                               | Detalle                                                                                                                                                 |
| --- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Idioma de la UI**                                    | Español neutro (latam sin voseo). Textos formales, "tú", sin modismos regionales.                                                                       |
| 2   | **Descuento Salario Personal Objetivo en FA2 inicial** | NO se descuenta al inicio. Se replica el comportamiento del Excel. El salario se configura cuando se activa el modo "Mejorado". Resultado: -$1,145,000. |
| 3   | **Librería de gráficos**                               | Recharts. Justificación: balance entre peso y experiencia de desarrollo.                                                                                |
| 4   | **Validación de enums**                                | CHECK constraints en SQL a nivel de migraciones. Planificar schema migration plan para cuando se necesite modificar CHECKs.                             |

---

## 3. Stack Propuesto y Justificación

| Capa          | Tecnología                                           | Justificación                                           |
| ------------- | ---------------------------------------------------- | ------------------------------------------------------- |
| Frontend      | React 18 + TypeScript + Vite + TailwindCSS + Zustand | Stack moderno, Zustand para estado reactivo local       |
| Backend       | Tauri v2 (Rust) con tauri-plugin-sql                 | Local-first, rendimiento nativo, SQLite embebido        |
| Base de datos | SQLite (enteros centavos para columnas monetarias)   | Evita problemas de punto flotante                       |
| Matemáticas   | decimal.js                                           | Precisión para cálculos financieros                     |
| Gráficos      | Recharts                                             | Integración nativa con React, buen DX, tamaño aceptable |
| Tests         | Vitest (frontend) + cargo test (backend)             | Golden tests con fixtures del Excel                     |

**Flujo de datos**:  
Entrada de usuario → Estado Zustand → Persistencia SQLite (debounced) → Lecturas normalizadas para UI → Cálculos con decimal.js → Renderizado con Recharts.

---

## 4. Enfoques Alternativos Considerados

### 4.1 Librería de Gráficos

| Alternativa            | Pros                                        | Contras                                    | Decisión |
| ---------------------- | ------------------------------------------- | ------------------------------------------ | -------- |
| **Recharts** (elegida) | React-native, buen DX, documentación amplia | Bundle más pesado que alternativas mínimas | ✓        |
| Chart.js               | Maduro, muchos ejemplos                     | Más pesado, menos idiomático para React    | No       |
| SVG puro               | Bundle mínimo                               | Más esfuerzo de desarrollo                 | No       |
| ApexCharts             | Buenos gráficos, buena API                  | Menos idiomático para React                | No       |

### 4.2 Gestión de Estado

| Alternativa           | Pros                                         | Contras                           | Decisión |
| --------------------- | -------------------------------------------- | --------------------------------- | -------- |
| **Zustand** (elegida) | Simple, TypeScript友好的, mínimo boilerplate | Comunidad más pequeña que Redux   | ✓        |
| Redux Toolkit         | Ecosistema maduro                            | Overkill para MVP                 | No       |
| Jotai                 | Atomic, buena integración con React          | Menos común, curva de aprendizaje | No       |

### 4.3 Persistencia

| Alternativa                             | Pros                          | Contras                    | Decisión |
| --------------------------------------- | ----------------------------- | -------------------------- | -------- |
| **tauri-plugin-sql + SQLite** (elegida) | Seguridad de tipos, poder SQL | Migration complexity       | ✓        |
| IndexedDB via Dexie.js                  | Más flexible, web-native      | Más complejo, menos tipado | No       |

### 4.4 Matemáticas Financieras

| Alternativa              | Pros                                     | Contras                       | Decisión |
| ------------------------ | ---------------------------------------- | ----------------------------- | -------- |
| **decimal.js** (elegida) | Precisión completa, banyak configuración | Bundle adicional              | ✓        |
| Números nativos JS       | Sin overhead                             | Riesgos de precisión          | No       |
| Money.js                 | Específico para dinero                   | Menos features que decimal.js | No       |

### 4.5 Validación de Enums

| Alternativa                            | Pros                              | Contras                      | Decisión |
| -------------------------------------- | --------------------------------- | ---------------------------- | -------- |
| **CHECK constraints en SQL** (elegida) | Integridad en BD, validación real | Migration compleja en SQLite | ✓        |
| Solo a nivel aplicación                | Simple                            | Datos corruptos posibles     | No       |

---

## 5. Riesgos Identificados

### 5.1 Riesgos Técnicos

1. **Atomicidad de upserts del Simulador con debounce**: Si el usuario edita el Simulador y se cierra la app antes del debounce, ¿se pierden los cambios? Se necesita flush on app close.

2. **Precisión en anualización ×12**: El Excel hace `valor_mensual * 12`. Si `valor_mensual` tiene fracciones de centavo (ej: 1,166,666.667), `* 12` da 14,000,000.004. Con decimal.js y rounding mode bien elegido, se evita drift.

3. **Migración futura a multi-moneda**: Si en v1.1 agregan USD/EUR, ¿se migra el schema sin perder histórico? Prever columna `moneda` desde v1.

4. **Testing del cálculo financiero al centavo**: El QA del PRD exige cierre al centavo. ¿Tests Vitest con fixtures del Excel como golden tests?

5. **Persistencia de la normalización temporal**: ¿Se recalcula en cada render (correcto pero costoso) o se cachea en vista SQLite?

6. **Compatibilidad cross-platform Tauri v2**: El MVP targetea Windows (donde se desarrolla). ¿macOS/Linux en roadmap?

7. **Migración de CHECK constraints en SQLite**: Alterar CHECK constraints requiere reescribir la tabla. Necesita estrategia de migración.

### 5.2 Riesgos de Producto

- **Complejidad de cálculos financieros**: Los formulas del Excel tienen edge cases que deben probarse exhaustivamente.
- **UX de modo "Mejorado"**: La activación del modo mejorado cambia el comportamiento del cálculo de FA2; debe ser claro para el usuario.

---

## 6. Preguntas Abiertas para la Fase de Propuesta

Las siguientes preguntas NO fueron respondidas en esta fase y se deferirán a `sdd-propose`:

1. **Límite duro de transacciones**: ¿Debe haber un límite máximo en el número de transacciones? (Actual: sin límite, pero implicaciones de rendimiento para grandes volúmenes de datos).

2. **Soporte multi-usuario**: ¿El multi-usuario (mismo dispositivo, diferentes perfiles) está en scope para v1 o se difiere?

---

## 7. Referencias

- **PRD**: `MVP-Financiero-Local_ Tecnologías-y-SCRUM.md`
- **Plantilla fuente**: `docs/Plantilla-diagnóstico-financiero-(Ejemplo).xlsx`
- **Análisis técnico**: `docs/analisis-plantilla-financiera.md`
- **Carpeta del cambio**: `openspec/changes/mvp-financiero-local-first/`
