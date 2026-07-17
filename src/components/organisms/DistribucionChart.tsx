// DistribucionChart — organism de Atomic Design que renderiza la
// distribución porcentual de una colección de categorías como un PieChart
// de Recharts (REQ-302).
//
// Ver `design.md` §1 (capa React con Recharts) + §7 (Atomic Design:
// `DistribucionChart` es un organism porque compone atoms de UI con un
// molecule de chart library externo). Es DUMB: recibe la distribución
// ya calculada por `distribucionGastosPorCategoria` /
// `distribucionIngresosPorCategoria` del dominio puro (REQ-302) y la
// renderiza. **No recalcula** — el cálculo del porcentaje es
// responsabilidad del dominio (`domain/agregaciones/graficos`).
//
// Contrato de `data-testid` (binding con el test file):
//   * `distribucion-chart` — root container del chart (también se usa
//     en el empty state, para que el tooling externo tenga un único
//     hook estable).
//
// Selector de Recharts usado en tests (API pública documentada):
//   * `path.recharts-sector` — un `<path>` por porción del PieChart.
//
// Estilo: tailwind utility classes (mismo set que `MatrizPresupuesto.tsx`
// y `ListaTransacciones.tsx`). Texto de UI: español neutro.

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import type { PieLabelRenderProps } from 'recharts'
import type { DistribucionPorcentual } from '../../domain/agregaciones/graficos'

interface DistribucionChartProps {
  distribucion: DistribucionPorcentual[]
  titulo: string
}

// Paleta de colores para los segmentos del PieChart. Cicla si hay más
// categorías que colores. Mantener un set amplio (10) evita el "color
// gris por default" en gráficos con muchas categorías, que es la mayor
// queja visual del chart por defecto de Recharts.
const PALETTE = [
  '#0ea5e9', // sky-500
  '#22c55e', // green-500
  '#f59e0b', // amber-500
  '#ef4444', // red-500
  '#8b5cf6', // violet-500
  '#ec4899', // pink-500
  '#14b8a6', // teal-500
  '#f97316', // orange-500
  '#6366f1', // indigo-500
  '#84cc16', // lime-500
]

/**
 * Formatea un valor numérico para el tooltip con separadores de miles
 * en español neutro (punto miles, sin decimales). Centralizado para
 * que las dos instancias del chart (Ingresos + Gastos) compartan el
 * mismo formato sin duplicar la lógica de i18n.
 *
 * La firma acepta `number | string | undefined` para alinearse con el
 * tipo `ValueType` que Recharts 3.x pasa al formatter (los `value`
 * son `number | string`; el `undefined` aparece cuando el tooltip
 * todavía no tiene payload). En la práctica siempre llega `number`
 * porque `data.value: number` en el payload del Pie. El caso `array`
 * de `ReadonlyArray<number | string>` se aplana a string para no
 * romper la compilación aunque no lo usemos.
 */
function formatearValorTooltip(
  value: number | string | ReadonlyArray<number | string> | undefined,
): string {
  if (value === undefined) return ''
  if (Array.isArray(value)) {
    return value.map((v) => v.toLocaleString('es-ES')).join(', ')
  }
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return String(value)
  return n.toLocaleString('es-ES')
}

/**
 * Render del label de cada porción: muestra el porcentaje con 1
 * decimal. Recharts 3.x pasa `PieLabelRenderProps` con varios campos;
 * nosotros sólo leemos `porcentaje`, que inyectamos en el payload vía
 * el map del `distribucion` arriba. La firma declarada en el tipo
 * importado es la que Recharts exige — usar `as unknown as` para
 * cruzar el casteo desde la forma pública a la lectura permisiva.
 */
function renderPorcentajeLabel(entry: PieLabelRenderProps): string {
  // `entry` contiene el spread del payload original, así que
  // `porcentaje` está disponible sin recalcular.
  const porcentaje = (entry as unknown as { porcentaje: number }).porcentaje
  return `${porcentaje.toFixed(1)}%`
}

export function DistribucionChart({
  distribucion,
  titulo,
}: DistribucionChartProps): JSX.Element {
  if (distribucion.length === 0) {
    return (
      <div data-testid="distribucion-chart" className="p-4">
        <h3 className="text-sm font-medium text-slate-700">{titulo}</h3>
        <p className="mt-2 text-sm text-slate-500">No hay datos para mostrar.</p>
      </div>
    )
  }

  // Recharts espera la forma { name, value }. Inyectamos `porcentaje`
  // también para que el render del label pueda leerlo sin recalcular.
  const data = distribucion.map((d) => ({
    name: d.label,
    value: d.valor.toNumber(),
    porcentaje: d.porcentaje,
  }))

  return (
    <div
      data-testid="distribucion-chart"
      className="rounded-md border border-slate-200 bg-white p-4"
    >
      <h3 className="text-sm font-medium text-slate-700">{titulo}</h3>
      <div className="mt-2 h-64">
        <ResponsiveContainer
          width={300}
          height={256}
          // En jsdom `ResizeObserver` no se dispara y
          // `getBoundingClientRect()` devuelve `0x0`, por lo que el
          // container por defecto `"100%" / "100%"` colapsa a 0x0 y
          // `PieChart` no emite ningún `path.recharts-sector`. Pasamos
          // dimensiones NUMÉRICAS explícitas para que `calculateChartDimensions`
          // las tome como literales (`isPercent(300) === false`) y el
          // chart renderice tanto en tests (jsdom) como en browser —
          // visualmente equivalente porque el `<div>` padre ya fija la
          // altura con `h-64` (256 px) y el chart ocupa el 100% del
          // ancho disponible.
        >
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={80}
              label={renderPorcentajeLabel}
              isAnimationActive={false}
            >
              {data.map((_, idx) => (
                <Cell key={idx} fill={PALETTE[idx % PALETTE.length]} />
              ))}
            </Pie>
            <Tooltip formatter={formatearValorTooltip} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}