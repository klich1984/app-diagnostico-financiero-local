# Cambio: mvp-financiero-local-first

## Propósito del cambio

Este cambio implementa el MVP de la aplicación financiera local-first para gestión de presupuesto personal. La aplicación permite crear diagnósticos financieros, gestionar ingresos y gastos, y analizar la capacidad de ahorro.

## Stack planificado

| Capa          | Tecnología                                           |
| ------------- | ---------------------------------------------------- |
| Frontend      | React 18 + TypeScript + Vite + TailwindCSS + Zustand |
| Backend       | Tauri v2 (Rust) con tauri-plugin-sql                 |
| Base de datos | SQLite (enteros centavos para columnas monetarias)   |
| Matemáticas   | decimal.js (precisión decimal)                       |
| Gráficos      | Biblioteca ligera SVG/Canvas (pendiente de decisión) |
| Tests         | Vitest (frontend) + cargo test (backend)             |

## Decisiones pendientes (resueltas)

Las siguientes decisiones fueron resueltas en la fase de exploración:

1. ~~**Idioma de la interfaz de usuario**~~ → Español neutro (latam sin voseo)
2. ~~**Discount Salario Personal Objetivo en FA2**~~ → NO se descuenta al inicio
3. ~~**Biblioteca de gráficos**~~ → Recharts
4. ~~**CHECK constraint para naturaleza_necesidad**~~ → CHECK constraints en SQL

Las preguntas abiertas para `sdd-propose` son:

- Límite duro de transacciones
- Soporte multi-usuario

## Estado

**Pendiente de `sdd-propose`**

---

## Decisiones Bloqueadas

Las siguientes decisiones fueron tomadas en la fase de exploración (`sdd-explore`) y están confirmadas:

| #   | Decisión                                               | Detalle                                                                                                                                                 |
| --- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Idioma de la UI**                                    | Español neutro (latam sin voseo). Textos formales, "tú", sin modismos regionales.                                                                       |
| 2   | **Descuento Salario Personal Objetivo en FA2 inicial** | NO se descuenta al inicio. Se replica el comportamiento del Excel. El salario se configura cuando se activa el modo "Mejorado". Resultado: -$1,145,000. |
| 3   | **Librería de gráficos**                               | Recharts. Justificación: balance entre peso y experiencia de desarrollo.                                                                                |
| 4   | **Validación de enums**                                | CHECK constraints en SQL a nivel de migraciones. Planificar schema migration plan para cuando se necesite modificar CHECKs.                             |

---

Este archivo es un andamiaje inicial. Los artefactos reales serán creados por las fases subsiguientes del SDD:

- `sdd-explore`: Exploración de requisitos
- `sdd-propose`: Propuesta de cambio
- `sdd-spec`: Especificación de requisitos
- `sdd-design`: Diseño técnico
- `sdd-tasks`: Desglose de tareas
- `sdd-apply`: Implementación
- `sdd-verify`: Verificación
- `sdd-archive`: Archivo

## Referencias del proyecto

- PRD: `MVP-Financiero-Local_ Tecnologías-y-SCRUM.md`
- Plantilla fuente: `docs/Plantilla-diagnóstico-financiero-(Ejemplo).xlsx`
- Análisis técnico: `docs/analisis-plantilla-financiera.md`
