# Delta para MVP v2 Features

## ADDED Requirements

### Requirement: REQ-V2-101 Edición de transacciones [Pendiente]

La aplicación MUST permitir editar una transacción existente y persistir los cambios sin duplicar registros ni cambiar el perfil propietario.

#### Scenario: Edición exitosa

- GIVEN una transacción existente del perfil activo
- WHEN el usuario la edita y guarda valores válidos
- THEN la lista muestra la misma transacción con los valores actualizados
- AND los totales derivados se recalculan para el perfil activo

#### Scenario: Edición inválida

- GIVEN una transacción en edición
- WHEN el usuario intenta guardar un monto inválido o campos obligatorios vacíos
- THEN la aplicación rechaza el guardado
- AND conserva los datos originales sin persistir cambios parciales

### Requirement: REQ-V2-102 Gestión de perfiles [Pendiente]

La aplicación MUST permitir crear, renombrar, seleccionar y eliminar perfiles, manteniendo aislamiento completo de datos por perfil.

#### Scenario: Crear y seleccionar perfil

- GIVEN la aplicación tiene al menos un perfil existente
- WHEN el usuario crea un perfil nuevo y lo selecciona
- THEN la vista activa usa el nuevo perfil
- AND no muestra transacciones de otros perfiles

#### Scenario: Eliminar perfil protegido

- GIVEN un perfil seleccionado con datos asociados
- WHEN el usuario intenta eliminarlo
- THEN la aplicación solicita confirmación explícita
- AND no elimina datos si la confirmación se cancela

### Requirement: REQ-V2-103 Toggle de Modo Mejorado [Pendiente]

La aplicación MUST ofrecer un control visible para alternar entre presupuesto base y presupuesto mejorado sin perder los datos originales.

#### Scenario: Activar modo mejorado

- GIVEN existen valores base y propuestos
- WHEN el usuario activa Modo Mejorado
- THEN la matriz y resultados muestran valores mejorados
- AND el presupuesto base permanece recuperable

#### Scenario: Sin simulación disponible

- GIVEN no existen valores propuestos para mejorar
- WHEN el usuario activa Modo Mejorado
- THEN la aplicación mantiene valores base
- AND informa que no hay simulación aplicable

### Requirement: REQ-V2-104 Calidad de entrada y layout [Implementado en commits 1-3]

La aplicación MUST sanitizar entradas numéricas y MUST mantener tablas y gráficos legibles sin solapamientos ni scroll horizontal no deseado.

#### Scenario: Sanitización numérica

- GIVEN un campo numérico o monetario
- WHEN el usuario ingresa letras o símbolos no permitidos
- THEN el valor visible conserva solo caracteres numéricos válidos
- AND el cálculo usa el valor sanitizado

#### Scenario: Layout estable

- GIVEN una vista con tablas y gráficos
- WHEN el contenido contiene leyendas o valores largos
- THEN el contenedor mantiene legibilidad
- AND no aparece scroll horizontal innecesario

### Requirement: REQ-V2-105 Estado de Resultados 1:1 [Implementado en commit 4]

La aplicación MUST mostrar el Estado de Resultados inicial y mejorado con la jerarquía completa de 16 filas equivalente a la plantilla Excel de referencia.

#### Scenario: Jerarquía completa

- GIVEN el usuario abre Estado de Resultados
- WHEN la tabla se renderiza
- THEN muestra ambas columnas, inicial y mejorada
- AND incluye ingresos, gastos, deudas, flujos, salario personal, variables y capacidad de inversión

#### Scenario: Valores consistentes

- GIVEN existen transacciones y simulación del perfil activo
- WHEN se calcula el Estado de Resultados
- THEN cada fila usa la categoría correspondiente
- AND los subtotales y flujos respetan la jerarquía de la plantilla
