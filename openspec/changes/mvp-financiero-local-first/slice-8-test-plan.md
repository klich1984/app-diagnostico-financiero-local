# Plan de tests — Slice 8 (Listado + Eliminar Transacciones UI)

> **Fase**: RED (TDD)
> **Branch**: `feat/ui-lista-transacciones` (creada desde `main`)
> **Fecha**: 2026-07-07
> **Change**: `mvp-financiero-local-first`

## Alcance

Slice 8 implementa la visualización del listado de transacciones en la UI
React + la eliminación de filas. Cubre el organismo `ListaTransacciones`
más un nuevo comando backend `cmd_eliminar_transaccion` y su wrapper TS
`eliminarTransaccion`. La fase IMPL queda delegada a un agente separado.

## Requisitos cubiertos

- **REQ-202** — Escenario "Eliminar transacción" (extensión del requisito
  de captura/listado ya implementado en Slice 3 + Slice 7). El listado
  en pantalla y la columna "Acciones" con botón Eliminar son superficie
  de este escenario.
- **REQ-602** — Validación de enumeraciones (los CHECK constraints que
  validan `tipo_flujo`, `frecuencia`, `comportamiento`,
  `naturaleza_necesidad` siguen activos en backend; este slice no los
  toca pero los test del listado los ejercitan indirectamente al
  hidratar filas reales).
- **REQ-601** — Formato monetario en español neutro: la columna `Valor`
  del listado usa `formatCentavos` del helper
  `src/domain/precision/money.ts`.

## Archivos de test

### 1. `src-tauri/tests/commands_test.rs` (modificado, +1 test)

Añadido un test de integración que cubre la API backend del nuevo
comando:

| Test | Función/módulo que valida | REQ |
|------|---------------------------|-----|
| `req_202_cmd_eliminar_transaccion_removes_row` | `crate::commands::cmd_eliminar_transaccion_impl(&Connection, id: i64) -> Result<(), String>` | REQ-202 |

El test:

1. Abre una DB en memoria con `apply_all` + seed (helper
   `fresh_db_with_user`).
2. Inserta una transacción válida vía `cmd_insert_transaccion_impl`.
3. Verifica que el listado la devuelve (`len == 1`).
4. Llama al nuevo `cmd_eliminar_transaccion_impl(conn, id)`.
5. Verifica que el listado ahora está vacío (`len == 0`).

**RED actual**: falla al compilar porque
`cmd_eliminar_transaccion_impl` no existe en `crate::commands`.

### 2. `src/data/__tests__/tauri-commands.test.ts` (modificado, +1 test)

Añadido un test para el wrapper TS que llama al comando backend:

| Test | Función/módulo que valida | REQ |
|------|---------------------------|-----|
| `eliminarTransaccion invokes cmd_eliminar_transaccion with id` | `eliminarTransaccion(id: number): Promise<void>` en `src/data/tauri-commands.ts` | REQ-202 |

El test:

1. Mockea `invoke` (patrón del test existente) y resuelve con
   `undefined`.
2. Llama a `eliminarTransaccion(42)`.
3. Verifica que `invoke` fue llamado con
   `'cmd_eliminar_transaccion'` y `{ id: 42 }` (forma exacta del
   payload, según contrato IPC de Tauri v2).

**RED actual**: falla con `TypeError: eliminarTransaccion is not a
function` (el módulo existe pero el símbolo no está exportado todavía).

### 3. `src/components/organisms/__tests__/ListaTransacciones.test.tsx` (nuevo, +6 tests)

Creado el directorio `src/components/organisms/__tests__/` y un archivo
de tests que cubre el organismo React:

| Test | Comportamiento que valida | REQ |
|------|---------------------------|-----|
| `slice8_lista_transacciones_renders_empty_state_when_no_data` | Estado vacío con texto "no hay transacciones" | REQ-202 |
| `slice8_lista_transacciones_renders_loading_state` | Estado de carga con texto "cargando transacciones" | REQ-202 |
| `slice8_lista_transacciones_renders_one_row_per_transaction` | Una fila por transacción + conceptos visibles | REQ-202 |
| `slice8_lista_transacciones_formats_valor_with_thousands_separator` | `formatCentavos` aplicado correctamente (formato español) | REQ-601 + REQ-202 |
| `slice8_lista_transacciones_shows_tipo_flujo_badge` | La columna Tipo muestra el texto del `tipo_flujo` | REQ-202 |
| `slice8_lista_transacciones_calls_on_eliminar_with_row_id` | Click en botón eliminar invoca `onEliminar(id)` | REQ-202 |

**Pin de la firma del componente** (binding para la fase IMPL):

```ts
export interface ListaTransaccionesProps {
  transacciones: TransaccionCompletaDto[]
  cargando: boolean
  onEliminar: (id: number) => void | Promise<void>
}

export function ListaTransacciones(props: ListaTransaccionesProps): JSX.Element
```

**Contrato `data-testid`** (los tests consultan estos hooks):

- `lista-transacciones` (raíz)
- `lista-vacia` (estado vacío)
- `lista-cargando` (estado de carga)
- `fila-transaccion` (cada fila)
- `eliminar-{id}` (botón eliminar de cada fila)

**Patrón de render**: `react-dom/client` + `createRoot` + `act()` (sin
`@testing-library/react`, igual que `TransaccionForm.test.tsx`).

**RED actual**: el archivo entero no compila — vite falla con
`Failed to resolve import "../ListaTransacciones"`.

## Verificación de RED

Comandos ejecutados:

```bash
cd src-tauri && cargo test --no-run
# → error[E0432]: unresolved import ... no cmd_eliminar_transaccion_impl in commands

pnpm test
# → 2 test files failed
# → 1 test failed (eliminarTransaccion not a function)
# → 80 tests passed (suite anterior intacta)
```

Ambos lados fallan como se esperaba. La fase IMPL queda delegada a un
agente separado.

## Notas / Riesgos

1. **`@testing-library/react` no instalado**: el proyecto usa el patrón
   nativo de `react-dom/client` + `createRoot` (regla dura del usuario:
   no agregar dependencias nuevas). El archivo de tests sigue ese patrón.
2. **Categorías seed**: el test del organismo usa `categoria_id = 5`
   (`Alimentacion`). El test backend usa el helper `categoria_id_for`
   para evitar hardcodear ids de seed (más robusto si la seed cambia).
3. **Estado de la rama**: la rama `feat/ui-lista-transacciones` se creó
   desde `main`. No hay commits todavía — el usuario revisará y
   committeará.