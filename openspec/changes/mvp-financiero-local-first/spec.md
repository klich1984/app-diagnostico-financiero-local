# Especificación: MVP Financiero Local-First

> Este documento define los requisitos formales del sistema con escenarios de verificación. Cada requisito tiene un identificador estable (REQ-NNN) que permite trazabilidad desde las historias de usuario del PRD.

---

## Purpose

Establecer los requisitos funcionales y no funcionales del sistema de diagnóstico financiero local-first, garantizando cierre al centavo contra el Excel fuente y cobertura completa de las 14 historias de usuario del PRD.

---

## Épica 1: Arquitectura de Persistencia y Puentes

### Requirement REQ-101: Inicialización del entorno Tauri-React

El sistema debe compilar exitosamente con `cargo tauri dev`, soportar IPC aislado del WebView mediante el modelo de capacidades de Tauri, e instalar las librerías `decimal.js` y TailwindCSS.

#### Scenario: Compilación exitosa del entorno

- GIVEN el repositorio configurado con Tauri v2 y React
- WHEN se ejecuta `cargo tauri dev`
- THEN la aplicación inicia sin errores de compilación
- AND la ventana del WebView muestra la interfaz React

#### Scenario: Aislamiento de capacidades IPC

- GIVEN la aplicación en ejecución
- WHEN se intenta acceder a APIs del sistema operativo desde el frontend
- THEN el acceso queda bloqueado por el sandbox de capacidades de Tauri

---

### Requirement REQ-102: Integración de SQLite nativo

El sistema debe disponibilizar una base de datos SQLite embebida mediante `tauri-plugin-sql`, con la base de datos almacenada en `BaseDirectory::App`.

#### Scenario: Carga de la base de datos SQLite

- GIVEN la aplicación iniciada
- WHEN se invoca `Database.load("sqlite:misfinanzas.db")`
- THEN la conexión se establece exitosamente
- AND el archivo se crea en el directorio de datos de la aplicación

#### Scenario: Capacidades SQL habilitadas

- GIVEN el archivo de capacidades de Tauri configurado
- WHEN se ejecutan operaciones `sql:default`, `sql:allow-execute`, `sql:allow-select`
- THEN las operaciones se ejecutan sin restricciones de permisos

---

### Requirement REQ-103: Migraciones versionadas y esquema inicial

El sistema debe ejecutar migraciones DDL para crear las tablas `Usuarios`, `Categorias`, `Transacciones` y `Simulador` con tipos INTEGER de 64 bits para montos monetarios y CHECK constraints para enumeraciones.

#### Scenario: Creación de tablas con esquema correcto

- GIVEN migraciones definidas en el código
- WHEN la aplicación se ejecuta por primera vez
- THEN las tablas se crean con las columnas especificadas
- AND las columnas monetarias usan tipo INTEGER para almacenar centavos

#### Scenario: Verificación de CHECK constraints

- GIVEN las migraciones aplicadas
- WHEN se intenta insertar un valor de frecuencia inválido
- THEN la operación falla con error SQLITE_CONSTRAINT_CHECK

---

## Épica 2: Captura Transaccional y CRUD

### Requirement REQ-201: Metadatos maestros precargados

El sistema debe precargar las categorías del diccionario mediante inserciones inicializadas en el arranque, y renderizar selects dependientes por tipo de flujo.

#### Scenario: Categorías precargadas en base de datos

- GIVEN la aplicación iniciada
- WHEN se consulta la tabla Categorias
- THEN contiene las categorías: Hogar, Alimentación, Transporte, Provisiones, Deudas entidades, Deudos conocidos, Entretenimiento, Familia, Impuestos, Otros gastos (gastos) y Salario, Otros ingresos, Negocio, Inversión (ingresos)

#### Scenario: Selects dependientes por tipo de flujo

- GIVEN el usuario en la pestaña de captura de transacciones
- WHEN selecciona "Ingreso" como tipo de flujo
- THEN el dropdown de categorías muestra solo categorías de ingreso

---

### Requirement REQ-202: Captura interactiva de flujos

El sistema debe permitir al usuario registrar, modificar y eliminar transacciones con inputs numéricos formateados, multiplicando el valor por 100 antes de persistir.

#### Scenario: Inserción de nueva transacción

- GIVEN el formulario de captura de transacciones
- WHEN el usuario ingresa: Concepto="Salario", Tipo_flujo="Ingreso", Comportamiento="Fijo", Frecuencia="Mensual", Categoría="Salario", Valor=4000000
- THEN la transacción se persiste en la tabla Transacciones con valor_centavos=400000000

#### Scenario: Actualización de transacción existente

- GIVEN una transacción existente en la base de datos
- WHEN el usuario modifica el valor a 4500000
- THEN la transacción se actualiza con valor_centavos=450000000

#### Scenario: Formateo de input numérico

- GIVEN el campo de valor en el formulario
- WHEN el usuario escribe "1.500.000"
- THEN el sistema interpreta el valor como 1500000

---

### Requirement REQ-203: Normalización temporal de transacciones

El sistema debe calcular el equivalente mensual de cada transacción aplicando los divisores correctos según la frecuencia declarada.

#### Scenario: Normalización Mensual

- GIVEN una transacción con valor=1200000 y frecuencia="Mensual"
- WHEN se calcula el equivalente mensual
- THEN el resultado es 1200000

#### Scenario: Normalización Trimestral

- GIVEN una transacción con valor=3500000 y frecuencia="Trimestral"
- WHEN se calcula el equivalente mensual
- THEN el resultado es 1166666.667

#### Scenario: Normalización Anual

- GIVEN una transacción con valor=12000000 y frecuencia="Anual"
- WHEN se calcula el equivalente mensual
- THEN el resultado es 1000000

#### Scenario: Normalización Bimensual

- GIVEN una transacción con valor=300000 y frecuencia="Bimensual"
- WHEN se calcula el equivalente mensual
- THEN el resultado es 150000

#### Scenario: Normalización Semestral

- GIVEN una transacción con valor=6000000 y frecuencia="Semestral"
- WHEN se calcula el equivalente mensual
- THEN el resultado es 1000000

---

## Épica 3: Dashboard y Presupuesto

### Requirement REQ-301: Matriz de agregación por categoría y naturaleza

El sistema debe calcular los totales de ingresos y gastos cruzados por categoría y naturaleza, replicando las fórmulas SUMIFS del Excel.

#### Scenario: Agregación de ingresos por categoría

- GIVEN el dataset de 32 transacciones cargado
- WHEN se calcula el total de ingresos por categoría
- THEN "Total Ingresos Mensual" muestra exactamente 7200000.00
- AND "Salario" muestra 4000000.00
- AND "Negocio" muestra 1166666.67
- AND "Otros ingresos" muestra 1866666.67

#### Scenario: Agregación de gastos por naturaleza

- GIVEN el dataset de 32 transacciones cargado
- WHEN se calculan los totales de gastos
- THEN "Total Gastos Mensual" muestra exactamente 8345000.00
- AND "Necesario" muestra 5060000.00
- AND "No tan necesario" muestra 1665000.00
- AND "No necesario" muestra 1620000.00

#### Scenario: Cálculo de Flujo de Caja Libre

- GIVEN los totales de ingresos y gastos calculados
- WHEN se calcula el Flujo de Caja Libre
- THEN el resultado es exactamente -1145000.00

---

### Requirement REQ-302: Gráficos de distribución porcentual

El sistema debe renderizar gráficos de barras y torta con distribución porcentual utilizando la librería Recharts.

#### Scenario: Renderizado de gráfico de torta de gastos

- GIVEN los totales de gastos por categoría calculados
- WHEN se renderiza el gráfico de distribución
- THEN se utiliza la librería Recharts
- AND cada segmento muestra el porcentaje correcto sobre el total

#### Scenario: Gráfico de barras de ingresos

- GIVEN los totales de ingresos por categoría
- WHEN se renderiza el gráfico de barras
- THEN cada barra representa una categoría con su valor proporcional

---

## Épica 4: Simulador de Oportunidades

### Requirement REQ-401: Filtro de gastos no esenciales

El sistema debe listar exclusivamente las transacciones con naturaleza "No necesario" o "No tan necesario" en el panel del simulador.

#### Scenario: Filtrado de gastos no esenciales

- GIVEN todas las transacciones en la base de datos
- WHEN el usuario navega al simulador de oportunidades
- THEN se muestran solo 12 transacciones: Internet, Restaurantes, Centro comercial, Juguetes perritos, Domicilios, Plan de datos, Seguro carro, Gimnasio, Streaming, Taxi/Uber/Bus, Viajes, Ropa

#### Scenario: Visualización de valor actual vs propuesto

- GIVEN el panel del simulador abierto
- WHEN se muestra una transacción filtrada
- THEN se exiben dos columnas: "Gasto mensual actual" y "Nuevo gasto mensual"

---

### Requirement REQ-402: Recálculo en tiempo real con persistencia

El sistema debe recalcular los totales de gastos variables y el ahorro potencial cuando el usuario modifica un valor en el simulador, persistiendo automáticamente.

#### Scenario: Modificación de valor en simulador

- GIVEN el simulador con la transacción "Restaurantes" en 600000
- WHEN el usuario cambia el nuevo valor a 200000
- THEN se calcula un ahorro de 400000 mensual
- AND el "Total Gastos Variables" se actualiza a 1215000.00
- AND el cambio se persiste en la tabla Simulador

#### Scenario: Anualización del ahorro

- GIVEN un ahorro mensual de 400000 en el simulador
- WHEN se calcula el ahorro anual
- THEN el resultado es 4800000.00

---

### Requirement REQ-403: Generación de presupuesto mejorado

El sistema debe generar el presupuesto mejorado mediante un left join entre Transacciones y Simulador, reemplazando valores solo para gastos no esenciales.

#### Scenario: Left join para presupuesto mejorado

- GIVEN las transacciones base y el simulador con modificaciones
- WHEN se genera el presupuesto mejorado
- THEN los gastos "Necesario" mantienen sus valores originales
- AND los gastos "No necesario" y "No tan necesario" usan los valores del simulador

#### Scenario: Total del presupuesto mejorado

- GIVEN todas las transacciones con modificaciones aplicadas
- WHEN se calcula el total de gastos del presupuesto mejorado
- THEN el resultado es exactamente 6275000.00

---

## Épica 5: Estado de Resultados y Métricas

### Requirement REQ-501: Visualizador de estado de resultados dual

El sistema debe mostrar dos columnas (Inicial y Mejorado) con los cálculos de Flujo de Ahorro 1, Flujo de Ahorro 2 y Capacidad de Inversión.

#### Scenario: Estado de Resultados Inicial

- GIVEN el dataset de 32 transacciones cargado
- WHEN el usuario navega a "Estado de Resultados" lado "Inicial"
- THEN "Flujo de Ahorro 1" muestra 2140000.00
- AND "Flujo de Ahorro 2" muestra -1145000.00
- AND "Capacidad Inversión" muestra -1145000.00

#### Scenario: Estado de Resultados Mejorado

- GIVEN el simulador con los valores propuestos
- WHEN el usuario navega a "Estado de Resultados" lado "Mejorado"
- THEN "Flujo de Ahorro 1" muestra 2140000.00
- AND "Flujo de Ahorro 2" muestra 425000.00
- AND "Capacidad Inversión" muestra 925000.00

---

### Requirement REQ-502: Salario Personal Objetivo configurable

El sistema debe permitir configurar el Salario Personal Objetivo en un modal de configuración, activando el modo "Mejorado" y deduciendo este valor del FA2.

#### Scenario: Configuración de salario objetivo

- GIVEN el modal de configuración abierto
- WHEN el usuario ingresa 500000 como Salario Personal Objetivo
- THEN el valor se persiste en la tabla Usuarios
- AND en el Estado de Resultados Mejorado se descuenta del FA2

#### Scenario: Salario objetivo no aplica en inicial

- GIVEN el Estado de Resultados en modo Inicial
- WHEN se visualiza la línea "Salario Personal"
- THEN el valor mostrado es 0 o vacío

---

## Requisitos Transversales

### Requirement REQ-601: Idioma de la interfaz en español neutro

El sistema debe mostrar todos los textos de la interfaz en español neutro sin voseo, utilizando formalidad y "tú".

#### Scenario: Verificación de textos en español neutro

- GIVEN la aplicación en ejecución
- WHEN se inspeccionan los textos visibles de la interfaz
- THEN ningún texto utiliza voseo (tú, vos)
- AND ningún texto utiliza modismos regionales

---

### Requirement REQ-602: Validación de enumeraciones con CHECK constraints

El sistema debe aplicar restricciones CHECK a nivel de base de datos para los campos de enumeración.

#### Scenario: Validación de frecuencia

- GIVEN la columna frecuencia con CHECK
- WHEN se intenta insertar una frecuencia inválida (ej: "Quincenal")
- THEN la operación falla con error SQLITE_CONSTRAINT_CHECK

#### Scenario: Validación de naturaleza

- GIVEN la columna naturaleza_necesidad con CHECK
- WHEN se intenta insertar un valor fuera de {Necesario, No tan necesario, No necesario}
- THEN la operación falla con error SQLITE_CONSTRAINT_CHECK

#### Scenario: Validación de comportamiento

- GIVEN la columna comportamiento con CHECK
- WHEN se intenta insertar un valor fuera de {Fijo, Variable}
- THEN la operación falla con error SQLITE_CONSTRAINT_CHECK

---

### Requirement REQ-603: Soporte multi-perfil

El sistema debe permitir múltiples perfiles de usuario con selector al abrir la aplicación, aislando completamente las transacciones de cada perfil.

#### Scenario: Selector de perfil al iniciar

- GIVEN la aplicación sin perfil activo
- WHEN se abre la aplicación
- THEN se muestra un selector de perfil obligatorio
- AND el usuario debe seleccionar o crear un perfil

#### Scenario: Aislamiento de datos por perfil

- GIVEN dos perfiles: "Personal" y "Trabajo"
- WHEN se crean transacciones en cada perfil
- THEN las transacciones del perfil "Personal" no aparecen en "Trabajo"
- AND cambiar de perfil filtra todas las consultas

#### Scenario: Cambio de perfil en menos de 1 segundo

- GIVEN múltiples perfiles creados
- WHEN el usuario cambia de un perfil a otro
- THEN el cambio se completa en menos de 1000ms

---

### Requirement REQ-604: Sin límite duro de transacciones

El sistema debe aceptar cualquier número de transacciones sin restricción, implementando scroll o paginación en la interfaz.

#### Scenario: Inserción de más de 100 transacciones

- GIVEN la aplicación con más de 100 transacciones
- WHEN se renderiza la lista de transacciones
- THEN la interfaz utiliza scroll virtualizado o paginación
- AND el rendimiento se mantiene fluido

---

### Requirement REQ-605: Cierre al centavo contra Excel fuente

El sistema debe replicar exactamente los valores del Excel fuente para el dataset de 32 transacciones.

#### Scenario: Réplica del dataset de 32 transacciones

- GIVEN la base de datos poblada con las 32 transacciones del Excel
- WHEN el usuario navega a la pestaña "Presupuesto"
- THEN "Total Ingresos Mensual" muestra exactamente 7200000.00
- AND "Total Gastos Mensual" muestra exactamente 8345000.00
- AND "Flujo de Caja Libre" muestra exactamente -1145000.00

#### Scenario: Réplica del Estado de Resultados Inicial

- GIVEN el dataset de 32 transacciones cargado
- WHEN el usuario navega a "Estado de Resultados"
- THEN "Flujo de Ahorro 1" muestra 2140000.00
- AND "Flujo de Ahorro 2 (Déficit Base)" muestra -1145000.00 (sin salario descontado)

#### Scenario: Réplica del Estado de Resultados Mejorado

- GIVEN el dataset de 32 transacciones cargado
- AND el Simulador contiene los valores del Excel (Restaurantes 200000, Internet 50000, Domicilios 100000, etc.)
- WHEN el usuario navega a "Estado de Resultados" lado "Mejorado"
- THEN "Flujo de Ahorro 1" muestra 2140000.00
- AND "Flujo de Ahorro 2 (Mejorado)" muestra 425000.00
- AND "Capacidad de Inversión" muestra 925000.00
- AND "Salario Personal Objetivo" muestra 500000.00

#### Scenario: Total Ahorro Anual

- GIVEN el simulador con mejoras aplicadas
- WHEN se calcula el ahorro anual total
- THEN el resultado es exactamente 24840000.00

---

## Resumen de Cobertura

| Tipo                             | Cantidad     |
| -------------------------------- | ------------ |
| Requisitos funcionales           | 14           |
| Requisitos transversales         | 5            |
| Total requisitos                 | 19           |
| Escenarios                       | 38           |
| HUs cubiertas                    | 14/14 (100%) |
| Decisiones de producto cubiertas | 6/6 (100%)   |
