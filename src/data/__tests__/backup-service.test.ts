import { describe, it, expect, beforeEach, vi } from 'vitest'
import { realizarBackup, seleccionarYRestaurarBackup } from '../backup-service'

vi.mock('@tauri-apps/plugin-dialog', () => ({
  save: vi.fn(),
  open: vi.fn(),
}))

vi.mock('../tauri-commands', () => ({
  exportarBackup: vi.fn(),
  restaurarBackup: vi.fn(),
}))

import { save, open } from '@tauri-apps/plugin-dialog'
import { exportarBackup, restaurarBackup } from '../tauri-commands'

const saveMock = save as unknown as ReturnType<typeof vi.fn>
const openMock = open as unknown as ReturnType<typeof vi.fn>
const exportarBackupMock = exportarBackup as unknown as ReturnType<typeof vi.fn>
const restaurarBackupMock = restaurarBackup as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Backup Service (Dialog integration)', () => {
  describe('realizarBackup', () => {
    it('returns null when user cancels save dialog', async () => {
      saveMock.mockResolvedValueOnce(null)

      const result = await realizarBackup()

      expect(saveMock).toHaveBeenCalledTimes(1)
      expect(exportarBackupMock).not.toHaveBeenCalled()
      expect(result).toBeNull()
    })

    it('calls exportarBackup and returns message when path selected', async () => {
      saveMock.mockResolvedValueOnce('C:\\backups\\misfinanzas.db')
      exportarBackupMock.mockResolvedValueOnce('Respaldo exportado exitosamente')

      const result = await realizarBackup()

      expect(saveMock).toHaveBeenCalledTimes(1)
      expect(exportarBackupMock).toHaveBeenCalledWith('C:\\backups\\misfinanzas.db')
      expect(result).toBe('Respaldo exportado exitosamente')
    })
  })

  describe('seleccionarYRestaurarBackup', () => {
    it('returns null when user cancels open dialog', async () => {
      openMock.mockResolvedValueOnce(null)

      const result = await seleccionarYRestaurarBackup()

      expect(openMock).toHaveBeenCalledTimes(1)
      expect(restaurarBackupMock).not.toHaveBeenCalled()
      expect(result).toBeNull()
    })

    it('calls restaurarBackup and returns message when file selected', async () => {
      openMock.mockResolvedValueOnce('C:\\backups\\misfinanzas.db')
      restaurarBackupMock.mockResolvedValueOnce('Respaldo restaurado exitosamente')

      const result = await seleccionarYRestaurarBackup()

      expect(openMock).toHaveBeenCalledTimes(1)
      expect(restaurarBackupMock).toHaveBeenCalledWith('C:\\backups\\misfinanzas.db')
      expect(result).toBe('Respaldo restaurado exitosamente')
    })
  })
})
