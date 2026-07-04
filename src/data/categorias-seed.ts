// categorias-seed.ts — Catálogo semilla de las 14 categorías del MVP.
//
// Réplica estática del seed SQL en `src-tauri/migrations/001_inicial.sql`
// (filas INSERT INTO Categorias). Existe para que la UI pueda renderizar
// el dropdown de "Categoría" del TransaccionForm sin necesidad de abrir
// la conexión a SQLite — útil en el demo de `pnpm tauri dev` y en los
// tests que solo necesitan la forma del catálogo.
//
// Reglas duras:
//   * Los IDs (1..14) y el orden deben matchear el seed SQL. El catálogo
//     se usa también como referencia en fixtures/golden tests, así que
//     cualquier reorden requiere tocar `001_inicial.sql` y los tests en
//     el mismo commit.
//   * `tipo_flujo` es TitleCase ('Ingreso' | 'Gasto') — el mismo set que
//     el CHECK constraint del SQL y que la columna `tipo_flujo` de
//     `Transacciones`. Coincide con el tipo exportado por
//     `TransaccionForm` (`CategoriaOption.tipo_flujo`), así que pasamos
//     este array directo al form sin transformaciones.
//
// Slice 4 va a reemplazar este módulo por una consulta real a la DB
// (`CategoriasRepo.listar()`), pero el contrato de tipos no cambia: el
// form sigue consumiendo `CategoriaOption[]`.

import type { CategoriaOption } from '../components/molecules/TransaccionForm'

export type { CategoriaOption }

export const CATEGORIAS_SEED: CategoriaOption[] = [
  // Ingreso (4)
  { id: 1, nombre: 'Salario', tipo_flujo: 'Ingreso' },
  { id: 2, nombre: 'Otros ingresos', tipo_flujo: 'Ingreso' },
  { id: 3, nombre: 'Negocio', tipo_flujo: 'Ingreso' },
  { id: 4, nombre: 'Inversion', tipo_flujo: 'Ingreso' },
  // Gasto (10)
  { id: 5, nombre: 'Alimentacion', tipo_flujo: 'Gasto' },
  { id: 6, nombre: 'Hogar', tipo_flujo: 'Gasto' },
  { id: 7, nombre: 'Transporte', tipo_flujo: 'Gasto' },
  { id: 8, nombre: 'Provisiones', tipo_flujo: 'Gasto' },
  { id: 9, nombre: 'Deudas entidades', tipo_flujo: 'Gasto' },
  { id: 10, nombre: 'Deudas conocidos', tipo_flujo: 'Gasto' },
  { id: 11, nombre: 'Entretenimiento', tipo_flujo: 'Gasto' },
  { id: 12, nombre: 'Familia', tipo_flujo: 'Gasto' },
  { id: 13, nombre: 'Impuestos', tipo_flujo: 'Gasto' },
  { id: 14, nombre: 'Otros gastos', tipo_flujo: 'Gasto' },
]
