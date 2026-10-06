import { save, open } from '@tauri-apps/plugin-dialog'
import { exportarBackup, restaurarBackup } from './tauri-commands'

/**
 * Dispara el diálogo nativo para guardar un respaldo de la base de datos
 * SQLite y ejecuta el comando IPC `cmd_exportar_backup`.
 *
 * @returns Mensaje de éxito si se exportó, o `null` si el usuario canceló.
 */
export async function realizarBackup(): Promise<string | null> {
  const hoy = new Date().toISOString().split('T')[0]
  const pathDestino = await save({
    title: 'Crear Respaldo de Base de Datos',
    defaultPath: `misfinanzas-backup-${hoy}.db`,
    filters: [
      {
        name: 'Base de Datos SQLite',
        extensions: ['db', 'sqlite'],
      },
    ],
  })

  if (!pathDestino) {
    return null
  }

  return exportarBackup(pathDestino)
}

/**
 * Dispara el diálogo nativo para seleccionar un archivo de respaldo y
 * ejecuta la validación y restauración atómica en SQLite.
 *
 * @returns Mensaje de éxito si se restauró, o `null` si el usuario canceló.
 */
export async function seleccionarYRestaurarBackup(): Promise<string | null> {
  const pathOrigen = await open({
    title: 'Seleccionar Archivo de Respaldo para Restaurar',
    multiple: false,
    directory: false,
    filters: [
      {
        name: 'Base de Datos SQLite',
        extensions: ['db', 'sqlite'],
      },
    ],
  })

  if (!pathOrigen || typeof pathOrigen !== 'string') {
    return null
  }

  return restaurarBackup(pathOrigen)
}
