import { save } from '@tauri-apps/plugin-dialog'
import { writeFile } from '@tauri-apps/plugin-fs'
import * as XLSX from 'xlsx'
import type { TransaccionCompletaDto } from './tauri-commands'
import type { EstadoResultados, LadoEstado } from '../domain/kpis'

export async function exportarExcel(
  transacciones: TransaccionCompletaDto[],
  estadoResultados: EstadoResultados | null,
): Promise<void> {
  // 1. Pedir al usuario que seleccione dónde guardar el archivo XLSX
  const pathDestino = await save({
    title: 'Guardar Reporte Financiero',
    defaultPath: 'diagnostico-financiero.xlsx',
    filters: [
      {
        name: 'Excel Workbook',
        extensions: ['xlsx'],
      },
    ],
  })

  if (!pathDestino) {
    // El usuario canceló
    return
  }

  // 2. Crear un nuevo libro de Excel
  const wb = XLSX.utils.book_new()

  // 3. Generar pestaña de Transacciones
  const headerTx = [
    'ID',
    'Tipo',
    'Categoría',
    'Concepto',
    'Frecuencia',
    'Comportamiento',
    'Necesidad',
    'Monto',
    'Fecha Creación',
  ]

  const dataTx = transacciones.map((tx) => [
    tx.id,
    tx.tipo_flujo,
    tx.categoria_nombre,
    tx.concepto,
    tx.frecuencia,
    tx.comportamiento ?? '',
    tx.naturaleza_necesidad ?? '',
    Number((tx.valor_centavos / 100).toFixed(2)),
    new Date(tx.created_at * 1000).toISOString().split('T')[0],
  ])

  const wsTx = XLSX.utils.aoa_to_sheet([headerTx, ...dataTx])
  XLSX.utils.book_append_sheet(wb, wsTx, 'Transacciones')

  // 4. Generar pestaña de Estado de Resultados (si existe)
  if (estadoResultados) {
    const kpiRows = [
      { label: 'INGRESOS MENSUALES', getValue: (l: LadoEstado) => l.total_ingresos.toNumber() },
      { label: 'Ingresos fijos', getValue: (l: LadoEstado) => l.ingresos_fijos.toNumber() },
      { label: 'Ingresos variables', getValue: (l: LadoEstado) => l.ingresos_variables.toNumber() },
      { label: 'GASTOS FIJOS', getValue: (l: LadoEstado) => l.gastos_fijos_total.toNumber() },
      {
        label: 'Gastos fijos necesarios',
        getValue: (l: LadoEstado) => l.gastos_fijos_necesarios.toNumber(),
      },
      {
        label: 'Gastos fijos provisiones',
        getValue: (l: LadoEstado) => l.gastos_fijos_provisiones.toNumber(),
      },
      { label: 'DEUDAS', getValue: (l: LadoEstado) => l.deudas_total.toNumber() },
      {
        label: 'Cuota deudas entidades',
        getValue: (l: LadoEstado) => l.cuota_deudas_entidades.toNumber(),
      },
      {
        label: 'Cuota deudas conocidos',
        getValue: (l: LadoEstado) => l.cuota_deudas_conocidos.toNumber(),
      },
      { label: 'FLUJO DE AHORRO 1', getValue: (l: LadoEstado) => l.flujo_ahorro_1.toNumber() },
      {
        label: 'SALARIO PERSONAL',
        getValue: (l: LadoEstado) =>
          l.salario_personal_objetivo ? l.salario_personal_objetivo.toNumber() : 0,
      },
      {
        label: 'GASTOS VARIABLES',
        getValue: (l: LadoEstado) => l.gastos_variables_total.toNumber(),
      },
      {
        label: 'Gastos no tan necesarios',
        getValue: (l: LadoEstado) => l.gastos_no_tan_necesarios.toNumber(),
      },
      {
        label: 'Gastos no necesarios',
        getValue: (l: LadoEstado) => l.gastos_no_necesarios.toNumber(),
      },
      { label: 'FLUJO DE AHORRO 2', getValue: (l: LadoEstado) => l.flujo_ahorro_2.toNumber() },
      {
        label: 'Capacidad inversión',
        getValue: (l: LadoEstado) => l.capacidad_inversion.toNumber(),
      },
    ]

    const headerEr = ['Concepto', 'Situación Inicial', 'Presupuesto Mejorado']

    const dataEr = kpiRows.map((row) => [
      row.label,
      Number((row.getValue(estadoResultados.inicial) / 100).toFixed(2)),
      Number((row.getValue(estadoResultados.mejorado) / 100).toFixed(2)),
    ])

    const wsEr = XLSX.utils.aoa_to_sheet([headerEr, ...dataEr])
    XLSX.utils.book_append_sheet(wb, wsEr, 'Estado de Resultados')
  }

  // 5. Convertir a binario y escribir a disco con Tauri FS
  // XLSX.write produce un array buffer o binario compatible con Uint8Array
  const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  await writeFile(pathDestino, new Uint8Array(excelBuffer))
}
