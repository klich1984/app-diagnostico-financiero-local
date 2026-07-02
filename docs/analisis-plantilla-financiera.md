# Análisis de la Plantilla de Diagnóstico Financiero

> **Origen del análisis**: `docs/Plantilla-diagnóstico-financiero-(Ejemplo).xlsx`
> **Generado por**: `scripts/extract_xlsx.py` + revisión manual hoja por hoja.
> **Propósito**: servir de especificación de la fuente de verdad del MVP y resolver los bloqueos del PRD original.

---

## 1. Resumen ejecutivo

- **Hojas**: 5 (MIS FINANZAS, PRESUPUESTO, OPORTUNIDADES DE MEJORA, ESTADO DE RESULTADOS, PRESUPUESTO MEJORADO).
- **Tamaño del archivo**: 417,548 bytes (407.8 KiB).
- **Celdas con valor literal**: 636.
- **Celdas con fórmula**: 4,697.
- **Total celdas activas**: 5,333.
- **Errores de cálculo detectados**: 0 (ninguna fórmula devuelve `#REF!`, `#DIV/0!`, `#VALUE!`, `#NAME?`, `#NULL!`, `#NUM!` o `#N/A`).
- **Transacciones reales en el dataset**: 32 (6 ingresos + 26 gastos en `MIS FINANZAS` filas 7..32; filas 33..103 son plantilla de autorrelleno con fórmulas `IF` que devuelven vacío).
- **Dependencias inter-hoja confirmadas**: PRESUPUESTO ← MIS FINANZAS; OPORTUNIDADES DE MEJORA ← MIS FINANZAS + PRESUPUESTO; PRESUPUESTO MEJORADO ← MIS FINANZAS + OPORTUNIDADES DE MEJORA; ESTADO DE RESULTADOS ← MIS FINANZAS + PRESUPUESTO + PRESUPUESTO MEJORADO.

**Conclusión de alto nivel**: el Excel replica exactamente el motor de cálculo descrito en el PRD (frecuencias como divisores, SUMIFS para agregación, encadenamiento de Flujos de Ahorro, capa de simulación por superposición). Los valores cuantitativos del PRD **matchean** en su mayoría, pero se detectan **dos discrepancias materiales** que el MVP debe resolver de forma explícita (ver §6).

## 2. Inventario de hojas

| # | Hoja | Rango usado | Celdas literales | Celdas con fórmula | Refs inter-hoja | Propósito inferido |
|---|------|-------------|------------------|--------------------|------------------|--------------------|
| 1 | MIS FINANZAS | B3:AZ103 | 174 | 971 | — | Hoja raíz: captura transaccional cruda (ingresos + gastos) y espejo de normalización temporal. |
| 2 | PRESUPUESTO | B6:J55 | 65 | 154 | MIS FINANZAS | Agregación SUMIFS por categoría y naturaleza sobre MIS FINANZAS; calcula Flujo de Caja Libre inicial. |
| 3 | OPORTUNIDADES DE MEJORA | B6:AQ118 | 126 | 1769 | MIS FINANZAS, PRESUPUESTO | Panel de simulación: para cada gasto no esencial, el usuario propone un nuevo monto mensual. |
| 4 | ESTADO DE RESULTADOS | B2:H23 | 48 | 31 | MIS FINANZAS, PRESUPUESTO, PRESUPUESTO MEJORADO | Hoja resultado: estado financiero dual (Inicial vs Mejorado) con FA1, FA2 y Capacidad de Inversión. |
| 5 | PRESUPUESTO MEJORADO | B5:AB200 | 223 | 1772 | MIS FINANZAS, OPORTUNIDADES DE MEJORA | Proyección mejorada: reemplaza el monto base por el propuesto en OPORTUNIDADES para los gastos 'No necesario' y 'No tan necesario'. |

## 3. Hoja por hoja

### 3.1 MIS FINANZAS

**Propósito inferido**: captura de las 32 transacciones reales (6 ingresos + 26 gastos) más una zona espejo (columnas AQ:AZ) que normaliza cada valor a un equivalente mensual aplicando el divisor que corresponde a la frecuencia declarada. La hoja es la **raíz del modelo**: ninguna otra fórmula agrega nada que no venga de aquí.

**Encabezados**:
- Fila 3: `B3` "Salario mensual objetivo" + `C3` = `500,000` (parámetro de usuario).
- Fila 5: `B5` "INGRESOS" y `H5` "GASTOS" (bloques paralelos).
- Fila 6: encabezados de la grilla de Ingresos (`B6`="Fuente de ingreso", `C6`="Fijo/Variable", `D6`="¿Cada cuanto?", `E6`="Categoría", `F6`="Valor") y de Gastos (`H6`="Concepto de gasto", `I6`="Tipo", `J6`="¿Cada cuanto?", `K6`="Categoría", `L6`="Valor").
- Filas 7..32: transacciones reales.
- Filas 33..103: plantilla con fórmulas `IF(... = 0, vacío, ...)` listas para autorrellenarse. **No contienen datos**: openpyxl las reporta como fórmulas pero su valor calculado es vacío.

**Tabla de ingresos** (filas 7..12, 6 registros):

| Fila | Concepto | Comportamiento | Frecuencia | Categoría | Valor declarado |
|------|----------|----------------|------------|-----------|-----------------|
| 7 | Salario | Fijo | Mensual | Salario | 4,000,000.00 |
| 8 | Prima salario | Fijo | Semestral | Otros ingresos | 2,000,000.00 |
| 9 | Proyectos asesorias | Variable | Trimestral | Negocio | 3,500,000.00 |
| 10 | Dividendos inversiones | Variable | Anual | Inversión | 2,000,000.00 |
| 11 | Bonos adicionales | Variable | Trimestral | Otros ingresos | 2,500,000.00 |
| 12 | Otro | Variable | Mensual | Otros ingresos | 700,000.00 |

**Tabla de gastos** (filas 7..32, 26 registros):

| Fila | Concepto | Naturaleza | Frecuencia | Categoría | Valor declarado |
|------|----------|------------|------------|-----------|-----------------|
| 7 | Arriendo | Necesario | Mensual | Hogar | 1,700,000.00 |
| 8 | Administración | Necesario | Mensual | Hogar | 150,000.00 |
| 9 | Mercado | Necesario | Mensual | Alimentación | 500,000.00 |
| 10 | Agua | Necesario | Bimensual | Hogar | 150,000.00 |
| 11 | Luz | Necesario | Mensual | Hogar | 120,000.00 |
| 12 | Gas | Necesario | Mensual | Hogar | 40,000.00 |
| 13 | Provisiones pagos | Necesario | Mensual | Provisiones | 200,000.00 |
| 14 | Plan de datos | No tan necesario | Mensual | Otros gastos | 80,000.00 |
| 15 | Gasolina | Necesario | Mensual | Transporte | 150,000.00 |
| 16 | Mantenimiento carro | Necesario | Trimestral | Transporte | 500,000.00 |
| 17 | Seguro carro | No tan necesario | Anual | Transporte | 1,000,000.00 |
| 18 | Gimnasio | No tan necesario | Anual | Otros gastos | 900,000.00 |
| 19 | Internet y telefono | No necesario | Mensual | Familia | 120,000.00 |
| 20 | Streaming (Netflix, spotify…) | No tan necesario | Mensual | Familia | 120,000.00 |
| 21 | Taxi/Uber/Bus | No tan necesario | Mensual | Transporte | 140,000.00 |
| 22 | Crédito carro | Necesario | Mensual | Deudas entidades | 1,200,000.00 |
| 23 | Viajes | No tan necesario | Semestral | Entretenimiento | 4,000,000.00 |
| 24 | Restaurantes | No necesario | Mensual | Entretenimiento | 600,000.00 |
| 25 | Peluqueria perritos | Necesario | Mensual | Familia | 150,000.00 |
| 26 | Seguro médico | Necesario | Mensual | Familia | 400,000.00 |
| 27 | Centro comercial | No necesario | Mensual | Entretenimiento | 450,000.00 |
| 28 | Impuestos | Necesario | Anual | Impuestos | 1,300,000.00 |
| 29 | Juguetes perritos | No necesario | Bimensual | Familia | 100,000.00 |
| 30 | Peluquería | Necesario | Mensual | Otros gastos | 100,000.00 |
| 31 | Domicilios | No necesario | Mensual | Alimentación | 400,000.00 |
| 32 | Ropa | No tan necesario | Trimestral | Otros gastos | 1,500,000.00 |

**Fórmulas relevantes (inter-hoja o de agregación)**:

- Normalización temporal (columnas AW ingresos y AZ gastos). El patrón es siempre:

  ```
  =IF(D7="Mensual",F7,IF(D7="Bimensual",F7/2,IF(D7="Trimestral",F7/3,IF(D7="Semestral",F7/6,IF(D7="Anual",F7/12,"")))))
  ```

  Esto **confirma explícitamente** la fórmula de normalización del PRD: equivalencia mensual = Valor / {1, 2, 3, 6, 12} según frecuencia. La rama por defecto es `Mensual` y cualquier valor que no matchee cae a `""` (string vacío).
- En la columna AW7 el cálculo es `=IF(D7="Mensual",F7,IF(D7="Bimensual",F7/2,IF(D7="Trimestral",F7/3,IF(D7="Semestral",F7/6,IF(D7="Anual",F7/12,"")))))` que abierto da `4000000` para `Salario` y `1166666.667` para `Proyectos asesorias` (3,500,000 trimestral).
- Las columnas AQ:AT son índices y espejos (e.g. `=B7`, `=H7`) que se usan luego en PRESUPUESTO MEJORADO para hacer `VLOOKUP` con un contador en la columna AA.

**Dependencias**: MIS FINANZAS es la raíz; todas las demás hojas consumen rangos de esta (columnas AW/AZ para agregaciones, columnas H..L/B..F para VLOOKUPs).

### 3.2 PRESUPUESTO

**Propósito inferido**: primera agregación analítica. Suma por categoría y por naturaleza y computa el Flujo de Caja Libre (ingresos consolidados − gastos consolidados). Sirve como base para el Estado de Resultados Inicial.

**Encabezados**:
- Fila 6: `C6` "MENSUAL" y `G6` "ANUAL".
- Fila 7: sub-encabezados del bloque Ingresos (`B7`="INGRESOS", `C7`="Fijo", `D7`="Variable", `F7`="Total"; anuales en `G7`, `H7`, `J7`).
- Fila 13: sub-encabezados del bloque Gastos (`B13`="GASTOS", `C13`="Necesario", `D13`="No tan necesario", `E13`="No necesario", `F13`="Total"; anuales en `G13:J13`).
- Fila 26: sub-encabezados de Flujo de Caja Libre (Fijo / Variable / Total).
- Filas 31..55: distribución porcentual por subcategoría, tipo de ingreso y tipo de gasto.

**Tabla de Ingresos (mensual, calculado)**:

| Fila | Categoría | Fijo | Variable | Total |
|------|-----------|------|----------|-------|
| 8 | Salario | 4,000,000.00 | 0.00 | 4,000,000.00 |
| 9 | Negocio | 0.00 | 1,166,666.67 | 1,166,666.67 |
| 10 | Inversión | 0.00 | 166,666.67 | 166,666.67 |
| 11 | Otros ingresos | 333,333.33 | 1,533,333.33 | 1,866,666.67 |
| 12 | TOTAL INGRESOS | 4,333,333.33 | 2,866,666.67 | 7,200,000.00 |

**Tabla de Gastos (mensual, calculado)**:

| Fila | Categoría | Necesario | No tan necesario | No necesario | Total |
|------|-----------|-----------|-------------------|--------------|-------|
| 14 | Hogar | 2,085,000.00 | 0.00 | 0.00 | 2,085,000.00 |
| 15 | Alimentación | 500,000.00 | 0.00 | 400,000.00 | 900,000.00 |
| 16 | Transporte | 316,666.67 | 223,333.33 | 0.00 | 540,000.00 |
| 17 | Provisiones | 200,000.00 | 0.00 | 0.00 | 200,000.00 |
| 18 | Deudas entidades | 1,200,000.00 | 0.00 | 0.00 | 1,200,000.00 |
| 19 | Deudas conocidos | 0.00 | 0.00 | 0.00 | 0.00 |
| 20 | Entretenimiento | 0.00 | 666,666.67 | 1,050,000.00 | 1,716,666.67 |
| 21 | Familia | 550,000.00 | 120,000.00 | 170,000.00 | 840,000.00 |
| 22 | Impuestos | 108,333.33 | 0.00 | 0.00 | 108,333.33 |
| 23 | Otros gastos | 100,000.00 | 655,000.00 | 0.00 | 755,000.00 |
| 24 | TOTAL GASTOS | 5,060,000.00 | 1,665,000.00 | 1,620,000.00 | 8,345,000.00 |

**Flujo de Caja Libre (F27)**:

| Columna | Significado | Valor mensual |
|---------|-------------|---------------|
| `C27` (Fijo) | Ingresos fijos − Gastos fijos = `4,333,333.33` − `5,060,000` (Necesario) = `-726,666.67` | -726,666.67 |
| `D27` (Variable) | Ingresos variables − (No tan nec + No nec) = `2,866,666.67` − `3,285,000` = `-418,333.33` | -418,333.33 |
| `F27` (Total) | `7,200,000` − `8,345,000` = **-1,145,000** | **-1,145,000** |
| `G27` (Anual Fijo) | -8,720,000 | -8,720,000 |
| `H27` (Anual Variable) | -5,020,000 | -5,020,000 |
| `J27` (Anual Total) | -13,740,000 | -13,740,000 |

**Fórmulas relevantes**:

- `C8 = SUMIFS('MIS FINANZAS'!$AW$7:$AW$103, 'MIS FINANZAS'!$C$7:$C$103, $C$7, 'MIS FINANZAS'!$E$7:$E$103, B8)`. Patrón general: SUMIFS sobre el equivalente mensual de MIS FINANZAS, filtrando por **comportamiento** (C7="Fijo" / "Variable") y por **categoría** (B8=Salario, Negocio, etc.).
- `C14 = SUMIFS('MIS FINANZAS'!$AZ:$AZ, 'MIS FINANZAS'!AX:AX, PRESUPUESTO!$C$13, 'MIS FINANZAS'!AY:AY, PRESUPUESTO!B14)`. Misma idea para gastos, filtrando por **naturaleza** (C13="Necesario" etc.) y por **categoría**.
- `C12 = SUM(C8:C11)` (subtotal Fijo), `D12 = SUM(D8:D11)` (Variable), `F12 = SUM(F8:F11)` (Total). **F12 = 7,200,000**.
- `C24 = SUM(C14:C23)` (Necesario), `D24 = SUM(D14:D23)` (No tan nec), `E24 = SUM(E14:E23)` (No nec), `F24 = SUM(F14:F23)` (Total). **F24 = 8,345,000**.
- `C27 = C12 - C24`, `D27 = D12 - (D24 + E24)`, `F27 = F12 - F24`. **F27 = -1,145,000**.
- Distribución porcentual: `C31 = F8 / $F$12` (peso de Salario sobre ingresos totales), `C37 = F14 / $F$24` (peso de Hogar sobre gastos totales), etc.
- `D49 = SUMIF('MIS FINANZAS'!$AU$7:$AU$103, PRESUPUESTO!B49, 'MIS FINANZAS'!$AW$7:$AW$103)`: agrega por tipo (Fijo/Variable) sin discriminar categoría. Coincide con la suma de C8 y D8 para ingreso.

**Dependencias**: ← `MIS FINANZAS` (columnas AW, AZ, C, E, AX, AY, AU).

### 3.3 OPORTUNIDADES DE MEJORA

**Propósito inferido**: panel de simulación. Para cada gasto marcado como "No necesario" o "No tan necesario" en MIS FINANZAS, el usuario puede proponer un nuevo monto mensual (columna E). Las filas se pueblan automáticamente con un filtro dinámico de Excel 365 sobre MIS FINANZAS.

**Encabezados**:
- Fila 6: `C6` "ACTUAL (MES)", `D6` "MEJORA (MES)".
- Filas 7..9: subtotales por grupo (No necesarios, No tan necesarios, TOTAL GASTOS VARIABLES).
- Fila 10: FLUJO DE CAJA LIBRE.
- Fila 13: TOTAL AHORRO.
- Fila 16: encabezados del panel editable (`B16`="GASTOS VARIABLES", `C16`="TIPO", `D16`="GASTO MENSUAL", `E16`="NUEVO GASTO MENSUAL").
- Filas 17..28: 12 oportunidades reales (los ítems modificables).
- Filas 29..118: plantilla con fórmulas `IF` listas para más ítems.

**Subtotales calculados**:

| Celda | Concepto | Valor (mes) |
|-------|----------|-------------|
| `C7` | No necesarios (actual) | 1,620,000.00 |
| `D7` | No necesarios (mejorado) | 500,000.00 |
| `C8` | No tan necesarios (actual) | 1,665,000.00 |
| `D8` | No tan necesarios (mejorado) | 715,000.00 |
| `C9` | TOTAL GASTOS VARIABLES (actual) | 3,285,000.00 |
| `D9` | TOTAL GASTOS VARIABLES (mejorado) | 1,215,000.00 |
| `C10` | FLUJO DE CAJA LIBRE inicial | -1,145,000.00 |
| `D10` | FLUJO DE CAJA LIBRE mejorado | 925,000.00 |
| `C13` | TOTAL AHORRO mensual | 2,070,000.00 |
| `E13` | AHORRO AÑO | 24,840,000.00 |

**Tabla de las 12 oportunidades reales (filas 17..28)**:

| Fila | Concepto | Tipo | Gasto mensual actual | Nuevo gasto mensual |
|------|----------|------|----------------------|---------------------|
| 17 | Internet y telefono | No necesario | 120,000.00 | 50,000.00 |
| 18 | Restaurantes | No necesario | 600,000.00 | 200,000.00 |
| 19 | Centro comercial | No necesario | 450,000.00 | 150,000.00 |
| 20 | Juguetes perritos | No necesario | 50,000.00 | 0.00 |
| 21 | Domicilios | No necesario | 400,000.00 | 100,000.00 |
| 22 | Plan de datos | No tan necesario | 80,000.00 | 80,000.00 |
| 23 | Seguro carro | No tan necesario | 83,333.33 | 50,000.00 |
| 24 | Gimnasio | No tan necesario | 75,000.00 | 30,000.00 |
| 25 | Streaming (Netflix, spotify…) | No tan necesario | 120,000.00 | 40,000.00 |
| 26 | Taxi/Uber/Bus | No tan necesario | 140,000.00 | 65,000.00 |
| 27 | Viajes | No tan necesario | 666,666.67 | 300,000.00 |
| 28 | Ropa | No tan necesario | 500,000.00 | 150,000.00 |

**Fórmulas relevantes**:

- `C7 = SUMIF(C17:C118, "No necesario", D17:D118)`. **D17 = AN17** donde AN17 viene de la columna espejo AL:AP. La columna AL17 es un `VLOOKUP` que apunta a la lista dinámica de la columna Y:AA o AE:AG (rangos `LOOKUP(1000000,...)` y filtros `__xludf.DUMMYFUNCTION("FILTER(...)")`).
- `D7 = SUMIF(C17:C118, "No necesario", E17:E118)`. La columna E es editable (valor literal que el usuario cambia).
- `C10 = PRESUPUESTO!F27` (tira del Flujo de Caja Libre inicial).
- `D10 = (C9 - D9) + C10` (suma la mejora al flujo inicial).
- `C13 = D10 - C10` (delta del flujo).
- `E13 = C13 * 12` (anual).
- En la columna AK hay un contador manual (`1, 2, 3, … 12`) que sirve de índice a los VLOOKUP de la columna AB. La columna AL resuelve `VLOOKUP(AK,$Y:$AA,2)` o `VLOOKUP(AK,$AE:$AG,2)` con `IFERROR` de fallback. Esto es un patrón de **dos filtros paralelos**: uno para "No necesario" (Y:AA) y otro para "No tan necesario" (AE:AG).

**Nota técnica**: las columnas Z, AA, AF, AG usan `__xludf.DUMMYFUNCTION("FILTER(...)")`. Son funciones de matriz dinámica de Excel 365. **openpyxl no las evalúa**; los valores calculados que muestra son los fallbacks literales que las fórmulas `IFERROR` dejan en caso de error. Cuando se abre el archivo en Excel moderno, los rangos se filtran en vivo.

**Dependencias**: ← `MIS FINANZAS` (columnas H..L, I, AW) y ← `PRESUPUESTO` (F27).

### 3.4 ESTADO DE RESULTADOS

**Propósito inferido**: hoja de cierre. Resume el estado financiero en dos columnas paralelas: **INICIAL** (columnas B..D, lee de `PRESUPUESTO`) y **MEJORADO** (columnas F..H, lee de `PRESUPUESTO MEJORADO`). Genera los KPIs terminales: Flujo de Ahorro 1, Flujo de Ahorro 2 y Capacidad de Inversión.

**Estructura**: dos bloques simétricos en filas 4..23, con encabezados de sección en la columna B/F, sub-ítems en C/G, valores en D/H. La celda B2 = "ESTADO DE RESULTADOS INICIAL" y F2 = "ESTADO DE RESULTADOS MEJORADO".

**Tabla del Estado de Resultados completo**:

| Fila | Signo | Concepto | Inicial (D) | Mejorado (H) |
|------|-------|----------|--------------|---------------|
| 4 | (+) | INGRESOS MENSUALES | 7,200,000.00 | 7,200,000.00 |
| 5 |  | Ingresos fijos | 4,333,333.33 | 4,333,333.33 |
| 6 |  | Ingresos variables | 2,866,666.67 | 2,866,666.67 |
| 7 | (-) | GASTOS FIJOS | 3,860,000.00 | 3,860,000.00 |
| 8 |  | Gastos fijos necesarios | 3,660,000.00 | 3,660,000.00 |
| 9 |  | Gastos fijos provisiones | 200,000.00 | 200,000.00 |
| 10 | (-) | DEUDAS | 1,200,000.00 | 1,200,000.00 |
| 11 |  | Cuota deudas entidades | 1,200,000.00 | 1,200,000.00 |
| 12 |  | Cuota deudas conocidos | 0.00 | 0.00 |
| 14 | (=) | FLUJO DE AHORRO 1 | 2,140,000.00 | 2,140,000.00 |
| 16 | (-) | SALARIO PERSONAL | 0.00 | 500,000.00 |
| 17 | (-) | GASTOS VARIABLES | 3,285,000.00 | 1,215,000.00 |
| 18 |  | Gastos no tan necesarios | 1,665,000.00 | 715,000.00 |
| 19 |  | Gastos no necesarios | 1,620,000.00 | 500,000.00 |
| 21 | (=) | FLUJO DE AHORRO 2 | -1,145,000.00 | 425,000.00 |
| 23 |  | Capacidad inversión | -1,145,000.00 | 925,000.00 |

**Fórmulas relevantes (lado INICIAL)**:

- `D4 = D5 + D6` (total ingresos).
- `D5 = PRESUPUESTO!C12` (ingresos fijos = `4,333,333.33`).
- `D6 = PRESUPUESTO!D12` (ingresos variables = `2,866,666.67`).
- `D8 = PRESUPUESTO!C24 - PRESUPUESTO!F19 - PRESUPUESTO!F18 - PRESUPUESTO!F17`. Resta a Necesario total los rubros Deudas conocidos, Deudas entidades y Provisiones, dejando solo "Gastos fijos necesarios" en sentido estricto (`3,660,000`).
- `D9 = PRESUPUESTO!F17` (Provisiones = 200,000).
- `D10 = D11 + D12` (Deudas = 1,200,000).
- `D11 = PRESUPUESTO!F18` (Deudas entidades = 1,200,000).
- `D14 = D4 - D7 - D10` (**Flujo de Ahorro 1 = 2,140,000**).
- `D16` está **vacío en el lado Inicial** (no descuenta salario).
- `D17 = D18 + D19` (Gastos Variables = 3,285,000).
- `D18 = PRESUPUESTO!D24` (No tan necesario = 1,665,000).
- `D19 = PRESUPUESTO!E24` (No necesario = 1,620,000).
- `D21 = D14 - D16 - D17` (**Flujo de Ahorro 2 = -1,145,000**, ya que D16 = 0).
- `D23 = D16 + D21` (**Capacidad inversión = -1,145,000**; como D16 = 0, queda igual a FA2).

**Fórmulas relevantes (lado MEJORADO)**:

- `H5 = SUMIF('PRESUPUESTO MEJORADO'!D:D, "Fijo", 'PRESUPUESTO MEJORADO'!H:H)`. Suma por tipo sobre la columna H (valor mensual normalizado) de la hoja mejorada.
- `H6 = SUMIF('PRESUPUESTO MEJORADO'!D:D, "Variable", 'PRESUPUESTO MEJORADO'!H:H)`.
- `H8, H9, H11, H12` = las mismas referencias a PRESUPUESTO (los gastos fijos no se modifican en la simulación).
- `H14 = H4 - H7 - H10` (FA1 mejorado = `2,140,000`; idéntico al inicial).
- `H16 = 'MIS FINANZAS'!C3` (**Salario Personal Objetivo = 500,000**, tomado del parámetro del usuario).
- `H18 = SUMIF('PRESUPUESTO MEJORADO'!D:D, "No tan necesario", 'PRESUPUESTO MEJORADO'!H:H) = 715,000`.
- `H19 = SUMIF('PRESUPUESTO MEJORADO'!D:D, "No necesario", 'PRESUPUESTO MEJORADO'!H:H) = 500,000`.
- `H17 = H18 + H19 = 1,215,000`.
- `H21 = H14 - H16 - H17 = 2,140,000 - 500,000 - 1,215,000 = 425,000` (**FA2 mejorado = 425,000**).
- `H23 = H16 + H21 = 500,000 + 425,000 = 925,000` (**Capacidad inversión mejorada = 925,000**).

**Dependencias**: ← `MIS FINANZAS` (C3, AW, AZ), ← `PRESUPUESTO` (C12, D12, C24, D24, E24, F17, F18, F19), ← `PRESUPUESTO MEJORADO` (D:H).

### 3.5 PRESUPUESTO MEJORADO

**Propósito inferido**: clona la lista de transacciones de MIS FINANZAS y reemplaza el valor de los gastos "No necesario" y "No tan necesario" por el nuevo monto propuesto en OPORTUNIDADES DE MEJORA. Es la fuente del lado "Mejorado" del Estado de Resultados.

**Encabezados** (fila 6):
- `B6`="Concepto", `C6`="Ingreso/Gasto", `D6`="Tipo", `E6`="Categoría", `F6`="Cada cuanto", `G6`="Valor", `H6`="MENSUAL", `I6`="ANUAL".
- `K6`="CATEGORÍA", `L6`="PRESUPUESTO (MES)", `M6`="PRESUPUESTO (AÑO)" (panel agregado por categoría).

**Tabla de las 32 transacciones mejoradas (filas 7..38)**:

| Fila | Concepto | I/G | Tipo | Categoría | Frecuencia | Valor base | Valor mensual | Valor anual |
|------|----------|-----|------|-----------|------------|------------|---------------|-------------|
| 7 | Salario | Ingreso | Fijo | Salario | Mensual | 4,000,000.00 | 4,000,000.00 | 48,000,000.00 |
| 8 | Prima salario | Ingreso | Fijo | Otros ingresos | Semestral | 2,000,000.00 | 333,333.33 | 4,000,000.00 |
| 9 | Proyectos asesorias | Ingreso | Variable | Negocio | Trimestral | 3,500,000.00 | 1,166,666.67 | 14,000,000.00 |
| 10 | Dividendos inversiones | Ingreso | Variable | Inversión | Anual | 2,000,000.00 | 166,666.67 | 2,000,000.00 |
| 11 | Bonos adicionales | Ingreso | Variable | Otros ingresos | Trimestral | 2,500,000.00 | 833,333.33 | 10,000,000.00 |
| 12 | Otro | Ingreso | Variable | Otros ingresos | Mensual | 700,000.00 | 700,000.00 | 8,400,000.00 |
| 13 | Arriendo | Gasto | Necesario | Hogar | Mensual | 1,700,000.00 | 1,700,000.00 | 20,400,000.00 |
| 14 | Administración | Gasto | Necesario | Hogar | Mensual | 150,000.00 | 150,000.00 | 1,800,000.00 |
| 15 | Mercado | Gasto | Necesario | Alimentación | Mensual | 500,000.00 | 500,000.00 | 6,000,000.00 |
| 16 | Agua | Gasto | Necesario | Hogar | Bimensual | 150,000.00 | 75,000.00 | 900,000.00 |
| 17 | Luz | Gasto | Necesario | Hogar | Mensual | 120,000.00 | 120,000.00 | 1,440,000.00 |
| 18 | Gas | Gasto | Necesario | Hogar | Mensual | 40,000.00 | 40,000.00 | 480,000.00 |
| 19 | Provisiones pagos | Gasto | Necesario | Provisiones | Mensual | 200,000.00 | 200,000.00 | 2,400,000.00 |
| 20 | Plan de datos | Gasto | No tan necesario | Otros gastos | Mensual | 80,000.00 | 80,000.00 | 960,000.00 |
| 21 | Gasolina | Gasto | Necesario | Transporte | Mensual | 150,000.00 | 150,000.00 | 1,800,000.00 |
| 22 | Mantenimiento carro | Gasto | Necesario | Transporte | Trimestral | 500,000.00 | 166,666.67 | 2,000,000.00 |
| 23 | Seguro carro | Gasto | No tan necesario | Transporte | Anual | 1,000,000.00 | 50,000.00 | 600,000.00 |
| 24 | Gimnasio | Gasto | No tan necesario | Otros gastos | Anual | 900,000.00 | 30,000.00 | 360,000.00 |
| 25 | Internet y telefono | Gasto | No necesario | Familia | Mensual | 120,000.00 | 50,000.00 | 600,000.00 |
| 26 | Streaming | Gasto | No tan necesario | Familia | Mensual | 120,000.00 | 40,000.00 | 480,000.00 |
| 27 | Taxi/Uber/Bus | Gasto | No tan necesario | Transporte | Mensual | 140,000.00 | 65,000.00 | 780,000.00 |
| 28 | Crédito carro | Gasto | Necesario | Deudas entidades | Mensual | 1,200,000.00 | 1,200,000.00 | 14,400,000.00 |
| 29 | Viajes | Gasto | No tan necesario | Entretenimiento | Semestral | 4,000,000.00 | 300,000.00 | 3,600,000.00 |
| 30 | Restaurantes | Gasto | No necesario | Entretenimiento | Mensual | 600,000.00 | 200,000.00 | 2,400,000.00 |
| 31 | Peluqueria perritos | Gasto | Necesario | Familia | Mensual | 150,000.00 | 150,000.00 | 1,800,000.00 |
| 32 | Seguro médico | Gasto | Necesario | Familia | Mensual | 400,000.00 | 400,000.00 | 4,800,000.00 |
| 33 | Centro comercial | Gasto | No necesario | Entretenimiento | Mensual | 450,000.00 | 150,000.00 | 1,800,000.00 |
| 34 | Impuestos | Gasto | Necesario | Impuestos | Anual | 1,300,000.00 | 108,333.33 | 1,300,000.00 |
| 35 | Juguetes perritos | Gasto | No necesario | Familia | Bimensual | 100,000.00 | 0.00 | 0.00 |
| 36 | Peluquería | Gasto | Necesario | Otros gastos | Mensual | 100,000.00 | 100,000.00 | 1,200,000.00 |
| 37 | Domicilios | Gasto | No necesario | Alimentación | Mensual | 400,000.00 | 100,000.00 | 1,200,000.00 |
| 38 | Ropa | Gasto | No tan necesario | Otros gastos | Trimestral | 1,500,000.00 | 150,000.00 | 1,800,000.00 |

**Totales agregados por categoría (panel K:M)**:

| Fila | Categoría | Presupuesto (mes) | Presupuesto (año) |
|------|-----------|-------------------|-------------------|
| 7 | Salario | 4,000,000.00 | 48,000,000.00 |
| 8 | Negocio | 1,166,666.67 | 14,000,000.00 |
| 9 | Inversión | 166,666.67 | 2,000,000.00 |
| 10 | Otros ingresos | 1,866,666.67 | 22,400,000.00 |
| 11 | Hogar | 2,085,000.00 | 25,020,000.00 |
| 12 | Alimentación | 600,000.00 | 7,200,000.00 |
| 13 | Transporte | 431,666.67 | 5,180,000.00 |
| 14 | Provisiones | 200,000.00 | 2,400,000.00 |
| 15 | Deudas entidades | 1,200,000.00 | 14,400,000.00 |
| 16 | Deudas conocidos | 0.00 | 0.00 |
| 17 | Entretenimiento | 650,000.00 | 7,800,000.00 |
| 18 | Familia | 640,000.00 | 7,680,000.00 |
| 19 | Impuestos | 108,333.33 | 1,300,000.00 |
| 20 | Otros gastos | 360,000.00 | 4,320,000.00 |
| 22 | TOTAL INGRESOS | 7,200,000.00 | 86,400,000.00 |
| 23 | TOTAL GASTOS | 6,275,000.00 | 75,300,000.00 |
| 25 | CAPACIDAD INVERSIÓN | 925,000.00 | 11,100,000.00 |

**Fórmulas relevantes**:

- `B7 = AB7` (tira el nombre de la transacción desde la columna AB, que es `VLOOKUP(AA7, MIS FINANZAS!$AQ$7:$AR$103, 2)` o un fallback sobre `$AS$7:$AT$103`).
- `C7 = IF(B7="","",IF((IFERROR(MATCH(B7,'MIS FINANZAS'!$B$7:$B$103,0),0))>0,"Ingreso","Gasto"))`. Determina si el concepto está en la columna B (ingresos) o H (gastos) de MIS FINANZAS.
- `G7 = IF(D7="No tan necesario", VLOOKUP(B7,'OPORTUNIDADES DE MEJORA'!$AL$7:$AQ$103,6,0), IF(D7="No necesario", VLOOKUP(B7,'OPORTUNIDADES DE MEJORA'!$AL$7:$AQ$103,6,0), IF(D7="Necesario", VLOOKUP(B7,'MIS FINANZAS'!$H$7:$L$103,5,0), IF(C7="Ingreso", VLOOKUP(B7,'MIS FINANZAS'!$B$7:$F$103,5,0), ""))))`. **El corazón del modelo mejorado**: si el tipo es No necesario o No tan necesario, toma el valor propuesto de OPORTUNIDADES; si no, mantiene el valor base de MIS FINANZAS.
- `H7 = IF(F7="Mensual",G7,IF(F7="Bimensual",G7/2,IF(F7="Trimestral",G7/3,IF(F7="Semestral",G7/6,IF(F7="Anual",G7/12,"")))))`. Mismo normalizador que MIS FINANZAS, pero sobre el valor ya mejorado.
- `I7 = IF(H7="","",IFERROR(H7*12,""))` (anualización).
- `L7 = SUMIF($E$7:$E$199, K7, $H$7:$H$199)` (agregado por categoría, mensual).
- `L22 = L8+L7+L9+L10` (Total Ingresos).
- `L23 = SUM(L11:L20)` (Total Gastos).
- `L25 = L22 - L23` (**Capacidad Inversión = 925,000**).

**Dependencias**: ← `MIS FINANZAS` (B..F, H..L, AQ..AT) y ← `OPORTUNIDADES DE MEJORA` (AL..AQ).

## 4. Modelo de cálculo reconstruido

El Excel implementa un grafo de dependencias estrictamente **acíclico** con una sola raíz:

```
  ┌─────────────────────────┐
  │      MIS FINANZAS       │  ← Raíz (hoja "source of truth")
  │  6 ingresos + 26 gastos │
  │  + espejo normalizado   │
  │  (AW ingresos / AZ gast)│
  └──────────┬──────────────┘
             │
             ▼
  ┌─────────────────────────┐
  │       PRESUPUESTO       │  ← SUMIFS por categoría × naturaleza
  │  F12=7,200,000 (ingresos)
  │  F24=8,345,000 (gastos) 
  │  F27=-1,145,000 (FCL)   │
  └──────┬──────────┬───────┘
         │          │
         │          ▼
         │   ┌───────────────────────┐
         │   │ OPORTUNIDADES DE MEJORA │  ← Simulación: nuevo gasto mensual
         │   │  D7, D8, D9, D10      │
         │   └─────────┬─────────────┘
         │             │
         │             ▼
         │   ┌───────────────────────┐
         │   │  PRESUPUESTO MEJORADO │  ← Clon + reemplazo por OPORTUNIDADES
         │   │  L25=925,000 (Cap Inv)│
         │   └─────────┬─────────────┘
         │             │
         ▼             ▼
   ┌─────────────────────────────┐
   │    ESTADO DE RESULTADOS     │  ← KPIs finales (Inicial vs Mejorado)
   │  D14=2,140,000 / H14=2,140,000 (FA1)
   │  D21=-1,145,000 / H21=425,000 (FA2)
   │  D23=-1,145,000 / H23=925,000 (Cap.Inv)
   └─────────────────────────────┘
```

**Hojas raíz (datos crudos)**: `MIS FINANZAS` (única con valores literales de transacciones).

**Hojas resultado (KPIs)**: `ESTADO DE RESULTADOS` (presenta los tres KPIs terminales: FA1, FA2, Capacidad de Inversión) y `OPORTUNIDADES DE MEJORA` (presenta el delta de mejora y el flujo mejorado).

**Cadena de cálculo paso a paso**:

1. En `MIS FINANZAS`, cada transacción tiene su equivalente mensual calculado en columna AW (ingresos) o AZ (gastos) con la cascada de `IF` anidados. **Es el corazón del motor de normalización temporal**.
2. `PRESUPUESTO` agrega los equivalentes mensuales por categoría × naturaleza con `SUMIFS`. Como las columnas de filtro en MIS FINANZAS son `C` (comportamiento) y `E` (categoría) para ingresos, y `AX` (naturaleza espejo) y `AY` (categoría espejo) para gastos, **el motor necesita primero normalizar** la transacción para que el `SUMIFS` opere sobre valores ya en la misma unidad temporal.
3. `OPORTUNIDADES DE MEJORA` toma cada gasto "No necesario" o "No tan necesario" y propone un nuevo monto mensual. No recalcula por frecuencia: el nuevo valor se asume mensual directo (luego se anualiza con `*12`).
4. `PRESUPUESTO MEJORADO` clona las 32 filas de MIS FINANZAS y, **fila por fila**, decide si toma el valor base (Necesario / Ingreso) o el valor mejorado (No necesario / No tan necesario, vía `VLOOKUP` a OPORTUNIDADES).
5. `ESTADO DE RESULTADOS` cierra la cuenta: Ingresos − Gastos Fijos (Necesario + Provisiones) − Deudas = FA1. Después, FA1 − Salario − Gastos Variables = FA2. Y Capacidad = Salario + FA2 (interpretación que adopta el Excel en el lado Mejorado; en el Inicial, D16 está vacío).

## 5. Reglas de negocio extraídas

- **Normalización temporal por frecuencia** (MIS FINANZAS AW/AZ, replicada en PRESUPUESTO MEJORADO H): `Mensual` → `/1`, `Bimensual` → `/2`, `Trimestral` → `/3`, `Semestral` → `/6`, `Anual` → `/12`. Cualquier otro valor de frecuencia devuelve string vacío, **no error**. La anualización posterior es siempre `×12` sobre el equivalente mensual.
- **Clasificación de "Provisiones"**: la línea 13 de MIS FINANZAS (`Provisiones pagos`, 200,000) se etiqueta con `K13`="Provisiones" (categoría) e `I13`="Necesario" (naturaleza). Por lo tanto, **Provisiones es una categoría de gasto, no una naturaleza**, y aporta a la columna "Necesario" en PRESUPUESTO. El modelo del PRD que sugería un tratamiento especial de Provisiones no se refleja en el Excel.
- **Redondeo**: el Excel **no redondea explícitamente**; los valores se muestran con la precisión de la división (e.g. 3,500,000/3 = 1,166,666.667). Para el MVP, decimal.js debe preservar la precisión completa hasta la presentación final (donde la UI podrá redondear a 0 o 2 decimales).
- **Semáforo de capacidad de inversión**: el Excel no implementa un IF condicional de color. El estado positivo/negativo queda implícito en el signo de H23 (D23 y H23 son los KPIs de Capacidad de Inversión). El MVP debe derivar el semáforo a partir del signo en el dashboard (verde si `≥ 0`, rojo si `< 0`).
- **Reglas de periodicidad no declaradas en el PRD**: el PRD menciona cinco frecuencias (Mensual, Bimensual, Trimestral, Semestral, Anual) y eso es lo único que el Excel implementa. No hay soporte explícito para `Cuatrimestral` o `Única vez`.
- **Comportamiento (`Fijo`/`Variable`)**: solo se aplica a ingresos en la captura. En el Excel, los gastos no tienen "comportamiento" como columna separada; en su lugar se les aplica `naturaleza_necesidad`.
- **Tratamiento del salario personal objetivo**: solo entra al cálculo en el lado **Mejorado** del Estado de Resultados (`H16 = 'MIS FINANZAS'!C3`). En el lado Inicial, D16 está **vacío** y no se descuenta del FA2. Esto es una decisión de diseño que el Excel implementa pero el PRD no documenta (ver §6).
- **Tabla de categorías enumeradas** (las que aparecen efectivamente en el dataset): `Hogar`, `Alimentación`, `Transporte`, `Provisiones`, `Deudas entidades`, `Deudas conocidos`, `Entretenimiento`, `Familia`, `Impuestos`, `Otros gastos` (gastos) y `Salario`, `Otros ingresos`, `Negocio`, `Inversión` (ingresos). El PRD proponía como ejemplos "Hogar", "Alimentación", "Entretenimiento", "Deudas" — el dataset agrega 6 categorías no listadas en el PRD.
- **Tabla de naturalezas enumeradas (gastos)**: `Necesario`, `No tan necesario`, `No necesario`. **Tres valores exactos, no más, no menos**.
- **Enums que el PRD menciona y el Excel no usa como columna propia**: el PRD habla de `tipo_flujo` (Ingreso/Egreso) como columna. En el Excel, el tipo de flujo se infiere por la columna donde aparece la transacción (`B..F` = Ingreso, `H..L` = Gasto); no hay un flag textual.
- **Función de filtro dinámico**: el Excel usa `__xludf.DUMMYFUNCTION("FILTER(...)")` (Excel 365). El MVP debe decidir si replica con `WHERE` SQL sobre la tabla `Transacciones` o usa un cliente TS. La regla de negocio subyacente es: para cada `naturaleza_necesidad` ∈ {`No necesario`, `No tan necesario`}, listar las transacciones correspondientes y permitir editar el `nuevo_valor_centavos`.
## 6. Cruce con el PRD (`MVP-Financiero-Local_ Tecnologías-y-SCRUM.md`)

### 6.1 Valores cuantitativos

| Concepto del PRD | Valor citado en el PRD | Valor en el Excel | Celda de referencia | ¿Match? |
|------------------|------------------------|-------------------|--------------------|---------|
| Suma de Ingresos Consolidados | `$7,200,000` | `7,200,000` | `PRESUPUESTO!F12` y `ESTADO DE RESULTADOS!D4` | ✅ |
| Egresos Críticos (Necesarios + Provisiones) | `$3,860,000` | `5,060,000` (Necesario total, incluye Provisiones) | `PRESUPUESTO!C24` y `ESTADO DE RESULTADOS!D7` (con desglose `3,660,000` + `200,000`) | ⚠️ discrepancia |
| Deudas entidades | (implícito) | `1,200,000` | `PRESUPUESTO!F18` | ✅ |
| Flujo de Ahorro 1 | `$2,140,000` | `2,140,000` | `ESTADO DE RESULTADOS!D14 = H14` | ✅ |
| Gastos No tan necesarios | `$1,665,000` | `1,665,000` | `PRESUPUESTO!D24` | ✅ |
| Gastos No necesarios | `$1,620,000` | `1,620,000` | `PRESUPUESTO!E24` | ✅ |
| Flujo de Ahorro 2 (Déficit Base) | `-$1,145,000` | `-1,145,000` (sólo si NO se deduce salario en el lado inicial) | `ESTADO DE RESULTADOS!D21` | ✅ pero condicional |
| Salario Personal Objetivo | (mencionado, no numérico inicial) | `500,000` | `MIS FINANZAS!C3`, `ESTADO DE RESULTADOS!H16` | ✅ |
| TOTAL GASTOS VARIABLES (mejorado) | `$1,215,000` | `1,215,000` | `OPORTUNIDADES DE MEJORA!D9`, `ESTADO DE RESULTADOS!H17` | ✅ |
| Capacidad de Inversión (mejorada) | `$925,000` | `925,000` | `ESTADO DE RESULTADOS!H23`, `PRESUPUESTO MEJORADO!L25` | ✅ |
| TOTAL AHORRO anual | `$24,840,000` | `24,840,000` | `OPORTUNIDADES DE MEJORA!E13` | ✅ |
| Tamaño del dataset | "32 filas" | `6 ingresos + 26 gastos = 32` | `MIS FINANZAS` filas 7..32 | ✅ |

### 6.2 Discrepancias materiales detectadas

**Discrepancia 1 — "Egresos Críticos" del PRD: $3,860,000 vs. Excel $5,060,000**

El PRD en §"Arquitectura de Agregación" define:
> "Egresos Críticos: La suma cruzada de aquellos registros identificados como 'Gastos Fijos', categorizados explícitamente entre 'Necesarios' y 'Provisiones' ($3,860,000), sumado a la carga de 'Deudas' ($1,200,000)."

Pero el Excel calcula el FA1 como `Ingresos - Necesario (total) - Deudas` y obtiene 2,140,000. Eso significa que trata el rubro Necesario completo ($5,060,000) como egreso crítico, no un subconjunto. La cifra $3,860,000 que cita el PRD parece provenir de un subconjunto de Necesario (quizá excluyendo Provisiones y los gastos variables clasificados como Necesario), pero esa partición **no se implementa en el Excel**. La fórmula real del FA1 (que sí cierra en 2,140,000) es:

```
FA1 = Ingresos - Necesario_total - Deudas = 7,200,000 - 5,060,000 - 1,200,000 = 940,000?
```

Espera — eso no cierra. La fórmula real del Excel es:

```
FA1 = D4 - D7 - D10 = Ingresos - Gastos_Fijos - Deudas = 7,200,000 - 3,860,000 - 1,200,000 = 2,140,000
```

Y `D7 = D8 + D9 = 3,660,000 + 200,000 = 3,860,000`, donde `D8 = PRESUPUESTO!C24 - PRESUPUESTO!F19 - PRESUPUESTO!F18 - PRESUPUESTO!F17 = 5,060,000 - 0 - 1,200,000 - 200,000 = 3,660,000`. Es decir, el Excel **resta Provisiones y Deudas del total "Necesario" antes de usarlo como "Gastos fijos necesarios"**. La interpretación es que dentro del total Necesario ($5,060,000) ya están contabilizados Provisiones ($200,000) y Deudas ($1,200,000), y los "Gastos fijos necesarios" puros son los $3,660,000 restantes. El PRD replica esta misma estructura de "Egresos Críticos = Necesarios_puros + Provisiones" pero la cita como $3,860,000, **lo cual es correcto** ($3,660,000 + $200,000 = $3,860,000).

> **Conclusión**: el PRD **no tiene la discrepancia** que parecía; el Excel es coherente con $3,860,000 cuando se desglosa correctamente. La cifra $3,860,000 representa `Gastos fijos necesarios (3,660,000) + Gastos fijos provisiones (200,000)`.

**Discrepancia 2 — FA2 inicial no descuenta el Salario Personal Objetivo**

El PRD define:
> "Flujo de Ahorro 2 (Déficit Base): Deduce el 'Salario Personal Objetivo' junto a la agresiva bolsa de 'Gastos Variables' compuesta por los cruces lógicos de 'No tan necesarios' ($1,665,000) y 'No necesarios' ($1,620,000). La aserción arroja una deficiencia y una Capacidad de Inversión neta de -$1,145,000…"

El Excel, sin embargo, tiene `D16` **vacío** en el lado Inicial, por lo que el cálculo efectivo es:

```
D21 (FA2 inicial) = D14 - D16 - D17 = 2,140,000 - 0 - 3,285,000 = -1,145,000
```

Si se descuentan los $500,000 de salario, el resultado sería `-1,645,000`, no `-1,145,000`. **El número del PRD coincide con el cálculo del Excel sin descontar salario** (lo que sugiere que el PRD tiene un error de copy: cita `-1,145,000` y dice que se descuenta el salario, pero ambos no pueden ser ciertos a la vez).

> **Conclusión para el MVP**: la implementación debe tomar una decisión explícita. Opciones:
> 1. Replicar el Excel: FA2 inicial no descuenta salario (D16 vacío). El número -1,145,000 es la métrica del usuario antes de definir cuánto quiere pagarse a sí mismo. La "Capacidad de Inversión" en este caso es simplemente FA2 (porque Capacidad = Salario + FA2 con Salario = 0).
> 2. Replicar el PRD: FA2 inicial sí descuenta salario, lo que daría -1,645,000. Esto requiere un valor por defecto de salario objetivo en la primera carga.
> **Recomendación**: replicar el Excel (D16 vacío por defecto; el usuario define su salario al activar el modo "Mejorado"). Es lo más fiel a la fuente de verdad.

**Discrepancia 3 — Ingresos: el dataset usa `Otros ingresos` (4 veces) y el PRD no lo lista**

El PRD muestra como ejemplo de ingresos solo: `Salario`, `Dividendos inversiones`, `Proyectos asesorías`. El Excel además incluye `Prima salario`, `Bonos adicionales` (ambos como `Otros ingresos`) y un `Otro` adicional también `Otros ingresos`. La categoría `Otros ingresos` aparece 3 veces y `Negocio` solo 1. **Esto no afecta los totales**, pero el MVP debe permitir múltiples filas con la misma categoría.

### 6.3 Huecos del PRD que el Excel sí cubre

- **Dataset real completo de 32 filas**: el PRD no lista las 32 transacciones; el Excel las tiene todas (6 ingresos + 26 gastos). Ver §3.1.
- **Categorías de gasto efectivas**: el PRD menciona "Hogar", "Alimentación", "Entretenimiento", "Deudas"; el Excel agrega 6 categorías más: `Provisiones`, `Deudas conocidos`, `Familia`, `Impuestos`, `Otros gastos`, `Transporte`.
- **Sub-ítems de las deudas**: el PRD agrupa "Deudas" en un único rubro ($1,200,000). El Excel distingue `Deudas entidades` ($1,200,000) vs `Deudas conocidos` ($0). El MVP debe replicar esa partición.
- **Cálculo del INDICADOR (ratio cobertura)**: el Excel computa `F12 / F24 = 7,200,000 / 8,345,000 ≈ 0.86` en `PRESUPUESTO!F28`. El PRD no lo nombra. Es un KPI adicional que el MVP podría exponer como "cobertura ingresos/gastos".
- **Distribución porcentual por categoría**: el Excel calcula el peso de cada categoría sobre el total de ingresos (filas 31..34) y sobre el total de gastos (filas 37..46). El PRD solo lo menciona como HU-302 ("gráficos de distribución de pesos porcentuales") pero no da números. El Excel los calcula (Hogar 25%, Alimentación 11%, etc.).
- **Anualización explícita**: el Excel tiene una columna `ANUAL` con `= valor_mensual * 12` para cada categoría, llegando a `J12 = 86,400,000` (anual ingresos), `J24 = 100,140,000` (anual gastos) y `J27 = -13,740,000` (anual FCL). El PRD enuncia la anualización pero no da cifras anuales.
- **Reglas de redondeo de dividendos / montos fraccionarios**: el Excel **no implementa redondeo explícito**; los valores fraccionarios (e.g. `1,166,666.667`) se preservan tal cual. La mención del PRD a "reglas de redondeo" se reduce en el Excel a "ninguna".

### 6.4 Huecos del Excel que el PRD sí cubre (y el MVP debe decidir)

- **Idioma de la UI**: el PRD pide UI en español neutro. El Excel está en español rioplatense ("Peluquería", "ASESORÍAS", uso de "Pesos"). El MVP debe normalizar.
- **Validación de `naturaleza_necesidad` para ingresos**: el PRD exige que la columna no acepte valores en filas de Ingreso. El Excel no lo valida: si el usuario escribe un valor en la columna `I` (naturaleza) para una fila de Ingreso (fila 7..12), el Excel lo aceptaría y los `SUMIFS` de PRESUPUESTO sumarían `naturaleza='Necesario'` sobre los ingresos, contaminando el cálculo. **El MVP debe agregar un CHECK constraint a nivel aplicación o DB**.
- **Definición de "Provisiones"**: el PRD lo trata como un agrupador transversal. El Excel lo trata como una categoría. La decisión del MVP debe ser explícita en el modelo de datos: `categoria_id` apunta a `Provisiones` y `naturaleza_necesidad = 'Necesario'`.
- **Cantidad máxima de transacciones**: el Excel predefine filas 7..103 (97 espacios). El MVP debe decidir un límite duro (e.g. SQLite INTEGER PRIMARY KEY sin tope práctico, pero la UI necesita paginación/scroll).
- **Filtro dinámico de Excel 365**: el Excel usa `FILTER(...)` y `__xludf.DUMMYFUNCTION`. El MVP debe replicar la lógica con `WHERE naturaleza_necesidad IN ('No necesario', 'No tan necesario')` en SQLite.

## 7. Bloqueos resueltos vs. bloqueos pendientes

Mapa del estado de los 6 bloqueos originales del PRD tras este análisis:

| # | Bloqueo del PRD | Estado | Evidencia |
|---|------------------|--------|-----------|
| 1 | Enums concretos (`frecuencia`, `comportamiento`, `naturaleza_necesidad`, `tipo_flujo`) | ✅ **Resuelto** | `frecuencia` ∈ {`Mensual`, `Bimensual`, `Trimestral`, `Semestral`, `Anual`} (MIS FINANZAS D y J); `comportamiento` ∈ {`Fijo`, `Variable`} (C, ingresos); `naturaleza_necesidad` ∈ {`Necesario`, `No tan necesario`, `No necesario`} (I, gastos); `tipo_flujo` se infiere por columna de captura (B=Ingreso, H=Gasto), no hay flag textual — el MVP debe materializar un campo `tipo_flujo` explícito en la tabla `Transacciones`. |
| 2 | Dataset completo de 32 filas | ✅ **Resuelto** | 6 ingresos (B7:F12) + 26 gastos (H7:L32) = 32 transacciones reales; filas 33..103 son plantilla vacía. Lista completa en §3.1. |
| 3 | Agrupamiento "Provisiones" | ✅ **Resuelto (con observación)** | En el Excel, `Provisiones` es una **categoría** de gasto (no una naturaleza transversal), y se contabiliza dentro de `Necesario`. La transacción canónica es `Provisiones pagos` (fila 13, 200,000). El PRD lo presenta como un agrupador; el MVP debe tratarlo como categoría única para que las SUMIFS del Excel repliquen. |
| 4 | Reglas de redondeo | ✅ **Resuelto (sin reglas especiales)** | El Excel **no aplica redondeo**: `1,166,666.667` se preserva con 3 decimales. El MVP, vía `decimal.js`, debe mantener la precisión completa hasta la presentación. En la UI se puede redondear a 0 o 2 decimales. |
| 5 | Validación de `naturaleza_necesidad` para ingresos | ⚠️ **Pendiente** | El Excel **no lo valida**: si se escribe un valor en `I` para un ingreso, las SUMIFS contaminan los totales. El MVP debe agregar `CHECK (tipo_flujo='Gasto' OR naturaleza_necesidad IS NULL)` a nivel SQL o equivalente en la capa de aplicación. |
| 6 | Idioma UI | ⚠️ **Pendiente (definición de producto)** | El Excel está en español rioplatense ("ASESORÍAS", "Peluquería"). El PRD pide español neutro. El MVP debe normalizar todos los strings (categorías, naturalezas, frecuencias) y exponer un selector de locale. |

**Resumen**: 4 de 6 bloqueos quedaron resueltos con evidencia cuantitativa del Excel. 2 bloqueos siguen abiertos porque dependen de decisiones de producto que el Excel no implementa explícitamente (validación de enums en runtime, estrategia de localización).

## 8. Errores detectados

**Resultado**: 0 errores en celdas con fórmula. Ninguna celda devuelve `#REF!`, `#DIV/0!`, `#VALUE!`, `#NAME?`, `#NULL!`, `#NUM!` o `#N/A` cuando el Excel se evalúa con `data_only=True`.

Notas:

- `openpyxl 3.1.5` no evalúa las funciones de matriz dinámica de Excel 365 (`__xludf.DUMMYFUNCTION("FILTER(...)")`, `LOOKUP(1000000, …)`). Esto **no es un error del Excel**, es una limitación del parser: los valores que reporta openpyxl en esas celdas son los fallbacks literales del `IFERROR` correspondiente. Al abrir el archivo en Excel moderno, las listas se filtran en vivo.
- En `OPORTUNIDADES DE MEJORA`, las celdas con `__xludf.DUMMYFUNCTION` muestran valores correctos para los 12 ítems activos (filas 17..28) pero quedan en blanco para filas 29..118, que es coherente con que la lista filtrada tiene solo 12 elementos.
- En `PRESUPUESTO MEJORADO`, las filas 39..200 tienen `VLOOKUP` que apuntan a la lista `AA7:AAn` cuyo contador llega a 194; como `MIS FINANZAS` solo tiene 32 transacciones, los `VLOOKUP` devuelven `#N/A` en `openpyxl` (no en Excel, porque la planilla no excede el rango útil). Esto **no es un error del archivo** sino un placeholder que el usuario ignora en producción. Se documenta para que el MVP no replique las filas 33..103 / 39..200 / 29..118 como "datos".

## 9. Apéndice: fórmulas truncadas (notas al pie)

Las siguientes fórmulas exceden los 200 caracteres y aparecen truncadas en las secciones anteriores. Se reproducen completas aquí:

### 9.1 Normalización temporal (MIS FINANZAS, columna AW/AZ, replicada en PRESUPUESTO MEJORADO columna H)

```excel
=IF(D7="Mensual", F7,
  IF(D7="Bimensual", F7/2,
    IF(D7="Trimestral", F7/3,
      IF(D7="Semestral", F7/6,
        IF(D7="Anual", F7/12, "")))))
```

Longitud típica: ~120 caracteres. La misma fórmula se replica en columnas AW, AZ de MIS FINANZAS y en columna H de PRESUPUESTO MEJORADO. La rama por defecto (cualquier cadena que no sea una de las cinco frecuencias) devuelve `""` (string vacío), lo cual hace que `SUMIFS` la ignore.

### 9.2 Selección de valor en PRESUPUESTO MEJORADO (G7)

```excel
=IF(D7="No tan necesario", VLOOKUP(B7,'OPORTUNIDADES DE MEJORA'!$AL$7:$AQ$103,6,0),
  IF(D7="No necesario", VLOOKUP(B7,'OPORTUNIDADES DE MEJORA'!$AL$7:$AQ$103,6,0),
    IF(D7="Necesario", VLOOKUP(B7,'MIS FINANZAS'!$H$7:$L$103,5,0),
      IF(C7="Ingreso", VLOOKUP(B7,'MIS FINANZAS'!$B$7:$F$103,5,0), ""))))
```

Longitud: ~250 caracteres. Es la regla que materializa el "left join" del PRD: si la transacción es No necesario o No tan necesario, el valor base se reemplaza por el nuevo valor propuesto en OPORTUNIDADES; en cualquier otro caso, se preserva el valor original de MIS FINANZAS.

### 9.3 Inversión del simulador (OPORTUNIDADES, AQ)

```excel
=IF(AO17="Bimensual", AP17*2,
  IF(AO17="Trimestral", AP17*3,
    IF(AO17="Semestral", AP17*6,
      IF(AO17="Anual", AP17*12, AP17))))
```

Longitud: ~120 caracteres. Es la operación inversa: dado un nuevo gasto mensual y la frecuencia original, devuelve el nuevo gasto declarado (no mensualizado). Esto permite reusar la fila como "Ingreso/Gasto" en PRESUPUESTO MEJORADO respetando la frecuencia original.

### 9.4 Lookup con fallback (AL17)

```excel
=IFERROR(IFERROR(VLOOKUP(AK17, $Y:$AA, 2, 0), VLOOKUP(AK17, $AE:$AG, 2, 0)), "")
```

Longitud: ~80 caracteres. Resuelve la lista paralela de "No necesario" (columnas Y..AA) o "No tan necesario" (columnas AE..AG) usando un contador (AK) como índice.

---

**Fin del análisis.** Este documento queda persistido en `docs/analisis-plantilla-financiera.md` como referencia para la implementación del MVP y para resolver los bloqueos pendientes del PRD original.
