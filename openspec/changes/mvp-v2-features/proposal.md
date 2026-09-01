# Change Proposal: MVP Financiero v2 - Edición, Gestión de Perfiles y Modo Mejorado

## Summary

Este cambio define la versión v2 de la aplicación Diagnóstico Financiero Local. Incorpora la edición de transacciones existentes (CRUD completo), la gestión activa de perfiles multiusuario en la interfaz y base de datos, el toggle dinámico de Modo Mejorado en la matriz consolidada y mejoras de UX/Performance.

## Requirements Overview

1. **REQ-V2-101: Edición de Transacciones (Action Edit)**
   - El usuario podrá presionar el botón "Editar" en cualquier fila de la lista de transacciones.
   - Se habilitará un modal o formulario de edición precargado con la transacción seleccionada.
   - Al guardar, el backend ejecutará `cmd_update_transaccion` actualizando la fila en SQLite y refrescando la vista.

2. **REQ-V2-102: Gestión Completa de Perfiles**
   - Permitir crear, renombrar y eliminar perfiles de usuario.
   - Aislamiento completo por `usuario_id` en todas las consultas y mutations.
   - Selector de perfil con capacidad de administración.

3. **REQ-V2-103: Modo Mejorado (Toggle Presupuesto Simulado)**
   - Toggle global para activar o desactivar la proyección simulada sobre el presupuesto actual sin cambiar de vista obligatoriamente.

4. **REQ-V2-104: Restricciones de Entrada y Layout Responsivo**
   - Sanitización estricta de inputs numéricos (bloqueo de caracteres alfabéticos/especiales).
   - Ajuste fluido del contenedor principal para evitar desplazamientos horizontales.

## Impact Analysis

- **Rust Backend**: Nueva función IPC `cmd_update_transaccion` en `commands.rs` y soporte CRUD completo en `db.rs` para perfiles.
- **Frontend TS/React**: Actualizaciones en `tauri-commands.ts`, `ListaTransacciones.tsx`, `TransaccionForm.tsx` y `SelectorPerfil.tsx`.
