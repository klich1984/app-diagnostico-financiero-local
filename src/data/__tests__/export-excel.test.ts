import { afterEach, describe, expect, it, vi } from 'vitest'
import * as XLSX from 'xlsx'
import { exportarExcel } from '../export-excel'
import type { TransaccionCompletaDto } from '../tauri-commands'
import type { EstadoResultados, LadoEstado } from '../../domain/kpis'

const { saveMock, writeFileMock } = vi.hoisted(() => ({
  saveMock: vi.fn(),
  writeFileMock: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({ save: saveMock }))
vi.mock('@tauri-apps/plugin-fs', () => ({ writeFile: writeFileMock }))

afterEach(() => vi.clearAllMocks())

const transacciones: TransaccionCompletaDto[] = [
  {
    id: 7,
    usuario_id: 1,
    tipo_flujo: 'Ingreso',
    categoria_id: 2,
    categoria_nombre: 'Salario',
    concepto: 'Sueldo',
    frecuencia: 'Mensual',
    comportamiento: 'Fijo',
    naturaleza_necesidad: 'Necesario',
    valor_centavos: 125050,
    created_at: 1704067200,
    updated_at: 1704067200,
  },
]

function lado(overrides: Partial<LadoEstado> = {}): LadoEstado {
  const zero = () => ({ toNumber: () => 0 }) as LadoEstado['total_ingresos']
  return {
    total_ingresos: { toNumber: () => 500000 } as LadoEstado['total_ingresos'],
    ingresos_fijos: zero(),
    ingresos_variables: zero(),
    gastos_fijos_total: zero(),
    gastos_fijos_necesarios: zero(),
    gastos_fijos_provisiones: zero(),
    deudas_total: zero(),
    cuota_deudas_entidades: zero(),
    cuota_deudas_conocidos: zero(),
    gastos_necesarios: zero(),
    gastos_no_tan_necesarios: zero(),
    gastos_no_necesarios: zero(),
    gastos_deudas: zero(),
    total_gastos: zero(),
    flujo_caja_libre: zero(),
    flujo_ahorro_1: zero(),
    gastos_variables_total: zero(),
    salario_personal_objetivo: null,
    flujo_ahorro_2: zero(),
    capacidad_inversion: zero(),
    fcl_anual: zero(),
    fa2_anual: zero(),
    cap_inv_anual: zero(),
    ...overrides,
  }
}

const estadoResultados: EstadoResultados = {
  inicial: lado(),
  mejorado: lado({ total_ingresos: { toNumber: () => 600000 } as LadoEstado['total_ingresos'] }),
}

describe('exportarExcel', () => {
  it('returns null on cancellation without writing a file', async () => {
    saveMock.mockResolvedValue(null)
    await expect(exportarExcel(transacciones, null)).resolves.toBeNull()
    expect(writeFileMock).not.toHaveBeenCalled()
  })

  it('writes workbook bytes to the selected path and preserves workbook data', async () => {
    saveMock.mockResolvedValue('/reports/finance.xlsx')
    writeFileMock.mockResolvedValue(undefined)
    await expect(exportarExcel(transacciones, estadoResultados)).resolves.toBe(
      '/reports/finance.xlsx',
    )

    expect(writeFileMock).toHaveBeenCalledTimes(1)
    const [path, bytes] = writeFileMock.mock.calls[0] as [string, Uint8Array]
    expect(path).toBe('/reports/finance.xlsx')
    expect(bytes).toBeInstanceOf(Uint8Array)

    const workbook = XLSX.read(bytes, { type: 'array' })
    expect(workbook.SheetNames).toEqual(['Transacciones', 'Estado de Resultados'])
    const transactions = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets.Transacciones!, {
      header: 1,
    })
    expect(transactions[0]).toEqual([
      'ID',
      'Tipo',
      'Categoría',
      'Concepto',
      'Frecuencia',
      'Comportamiento',
      'Necesidad',
      'Monto',
      'Fecha Creación',
    ])
    expect(transactions[1]?.[7]).toBe(1250.5)
    expect(transactions[1]?.[8]).toBe('2024-01-01')

    const results = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets['Estado de Resultados']!, {
      header: 1,
    })
    expect(results[0]).toEqual(['Concepto', 'Situación Inicial', 'Presupuesto Mejorado'])
    expect(results.find((row) => row[0] === 'INGRESOS MENSUALES')).toEqual([
      'INGRESOS MENSUALES',
      5000,
      6000,
    ])
  })

  it('omits Estado de Resultados when there is no result state', async () => {
    saveMock.mockResolvedValue('/reports/transactions.xlsx')
    await exportarExcel(transacciones, null)
    const bytes = writeFileMock.mock.calls[0]?.[1] as Uint8Array
    expect(XLSX.read(bytes, { type: 'array' }).SheetNames).toEqual(['Transacciones'])
  })

  it('uses a SheetJS version with the security fix', async () => {
    const manifest = await import('../../../package.json', { with: { type: 'json' } })
    const source = manifest.dependencies.xlsx as string
    expect(source).toBe('https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz')
    expect(XLSX.version).toBe('0.20.3')
  })
})
