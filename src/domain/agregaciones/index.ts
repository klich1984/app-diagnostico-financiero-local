// MVP Financiero - barrel del módulo de agregaciones.
//
// Las páginas React y los tests importan `calcularMatriz`, las
// interfaces (`MatrizIngreso`, etc.), los tipos de entrada
// (`TransaccionMin`, `CategoriaMin`) y las funciones de gráficos desde
// este punto de entrada. Mantener un barrel evita que los consumidores
// conozcan la distribución interna de archivos (`matriz.ts` y
// `graficos.ts`) y permite reorganizar sin tocar imports en la UI.

export {
  type TransaccionMin,
  type CategoriaMin,
  type MatrizIngreso,
  type MatrizGasto,
  type MatrizPresupuesto,
  calcularMatriz,
} from './matriz'

export {
  type DistribucionPorcentual,
  distribucionGastosPorCategoria,
  distribucionIngresosPorCategoria,
} from './graficos'
