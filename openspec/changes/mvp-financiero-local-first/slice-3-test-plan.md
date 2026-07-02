# Slice 3 — Plan de tests (fase RED)

> Documento de planificación de la fase RED de **Slice 3** (Épica 2:
> Captura Transaccional y CRUD). Cubre **REQ-202** (captura interactiva
> de flujos + formateo de input numérico) y **REQ-203** (normalización
> temporal de transacciones). El detalle por REQ vive en
> `openspec/changes/mvp-financiero-local-first/spec.md` y el blueprint de
> arquitectura en `design.md` §7 (capa React), §8 (motor de normalización)
> y §14 (TDD).

## 1. Alcance

| REQ     | Tareas   | Descripción corta                                                                              |
| ------- | -------- | ---------------------------------------------------------------------------------------------- |
| REQ-202 | T-202, T-203, T-205 | CRUD de transacciones (backend Rust) + formateo de input (frontend TS)            |
| REQ-203 | T-204    | Motor de normalización temporal (frontend TS, decimal.js)                                     |

Las dos épicas del slice se reparten en dos lenguajes porque la
arquitectura ya está fijada (ver `design.md` §1, regla #2 "Cálculo en el
frontend"): el backend Rust solo persiste, y los cálculos viven en
TypeScript donde `decimal.js` ofrece 28 dígitos de precisión contra el
`INTEGER` de SQLite.

## 2. Archivos creados en esta fase

```
src-tauri/tests/
└── transacciones_repo_test.rs     ← REQ-202 backend (7 tests)

src/domain/normalizacion/
└── __tests__/
    └── index.test.ts              ← REQ-203 normalización (8 tests)

src/domain/precision/
└── __tests__/
    └── money-form.test.ts         ← REQ-202 parser/formatter (5 tests)

src/components/molecules/
└── __tests__/
    └── TransaccionForm.test.tsx   ← REQ-202 formulario (4 tests)
```

Total: **4 archivos de test, 24 tests** distribuidos en 3 archivos
nuevos más uno extendido.

| Archivo                                  | REQ     | Tests | Estado RED                                          |
| ---------------------------------------- | ------- | ----- | --------------------------------------------------- |
| `src-tauri/tests/transacciones_repo_test.rs`  | REQ-202 | 7     | COMPILE-FAIL: `transacciones::repo` no declarado    |
| `src/domain/normalizacion/__tests__/index.test.ts`     | REQ-203 | 8     | IMPORT-FAIL: `src/domain/normalizacion/index.ts` ausente |
| `src/domain/precision/__tests__/money-form.test.ts`   | REQ-202 | 5     | RUNTIME-FAIL: `parseAmount`, `toCentavos`, `formatCentavos` son `undefined` |
| `src/components/molecules/__tests__/TransaccionForm.test.tsx` | REQ-202 | 4     | IMPORT-FAIL: `TransaccionForm` ausente              |

## 3. Qué valida cada archivo

### `transacciones_repo_test.rs` (REQ-202)

| Test                                                       | Mecanismo                  | Estado RED                                       |
| ---------------------------------------------------------- | -------------------------- | ------------------------------------------------ |
| `req_202_repo_inserts_transaccion_with_centavos`            | In-memory DB + CHECK       | COMPILE-FAIL (E0433 sobre `transacciones::repo`) |
| `req_202_repo_rejects_negative_or_zero_valor`              | In-memory DB + CHECK       | COMPILE-FAIL                                      |
| `req_202_repo_lists_all_transacciones_for_user`            | In-memory DB + orden       | COMPILE-FAIL                                      |
| `req_202_repo_updates_transaccion_in_place`                | In-memory DB + trigger     | COMPILE-FAIL                                      |
| `req_202_repo_soft_or_hard_deletes_transaccion`            | In-memory DB               | COMPILE-FAIL                                      |
| `req_202_repo_enforces_check_constraint_on_frecuencia`     | In-memory DB + CHECK       | COMPILE-FAIL                                      |
| `req_202_repo_rejects_ingreso_with_naturaleza_necesidad`   | In-memory DB + CHECK cruce | COMPILE-FAIL                                      |

El fixture `fresh_db_with_user()` aplica `migrations::apply_all` (símbolo
ya pineado en Slice 2) y crea un `Usuario` para satisfacer la FK. Cada
test corre contra una DB en memoria fresca — `apply_all` es idempotente
pero los CHECK constraints son más fáciles de ejercitar sobre un esquema
virgen.

### `normalizacion/__tests__/index.test.ts` (REQ-203)

| Test                                                  | Mecanismo              | Estado RED                       |
| ----------------------------------------------------- | ---------------------- | -------------------------------- |
| `req_203_mensual_divides_by_1`                        | Decimal.equals         | IMPORT-FAIL: `..` no resuelve    |
| `req_203_bimensual_divides_by_2`                      | Decimal.toString       | IMPORT-FAIL                       |
| `req_203_trimestral_divides_by_3_exact`               | Decimal.toString       | IMPORT-FAIL                       |
| `req_203_semestral_divides_by_6`                      | Decimal.toString       | IMPORT-FAIL                       |
| `req_203_anual_divides_by_12`                         | Decimal.toString       | IMPORT-FAIL                       |
| `req_203_handles_non_exact_division_without_drift`    | Decimal.equals literal | IMPORT-FAIL                       |
| `req_203_rejects_invalid_frecuencia`                  | expect.toThrow         | IMPORT-FAIL                       |
| `req_203_anualizacion_multiplies_by_12_without_drift` | Decimal.toString       | IMPORT-FAIL                       |
| `req_203_anualizacion_of_anual_is_identity`           | Decimal.toString       | IMPORT-FAIL                       |

Las funciones esperadas (`valorMensual`, `valorAnual`) **deben** usar
`decimal.js` (no `Number`) — el test `req_203_handles_non_exact_…` es
el guardián anti-drift: verifica que `50000000 / 3` no caiga en la
representación IEEE-754 `16666666.666666664`.

> **Nota sobre naming**: el prompt del usuario pide
> `valorMensual` / `valorAnual`, que difieren del diseño
> (`mensualizar` / `anualizar`, ver `design.md` §8.3). Los tests
> pinean los nombres del prompt por ser el contrato vinculante. Si la
> fase IMPL prefiere los nombres del diseño, puede hacer un re-export
> `export { mensualizar as valorMensual }` (y análogo para anualizar)
> sin tocar los tests.

### `precision/__tests__/money-form.test.ts` (REQ-202)

| Test                                                    | Mecanismo          | Estado RED                                  |
| ------------------------------------------------------- | ------------------ | ------------------------------------------- |
| `req_202_parse_amount_handles_dot_separator`            | expect.toBe        | RUNTIME: `parseAmount is not a function`    |
| `req_202_parse_amount_handles_comma_decimal`            | expect.toBe        | RUNTIME: `parseAmount is not a function`    |
| `req_202_to_centavos_multiplies_by_100`                 | expect.toBe        | RUNTIME: `toCentavos is not a function`     |
| `req_202_parse_then_to_centavos_round_trip`             | composición        | RUNTIME: ambos `undefined`                   |
| `req_202_format_centavos_uses_thousands_separator`      | expect.toBe string | RUNTIME: `formatCentavos is not a function` |

El test `req_202_format_centavos_uses_thousands_separator` es el guard
de **REQ-601** (idioma UI en español neutro): pinea explícitamente que
la salida es `"1.500.000,50"` con punto como separador de miles y coma
como decimal. La fase IMPL no debe "mejorar" la salida a formato
inglés.

### `molecules/__tests__/TransaccionForm.test.tsx` (REQ-202)

| Test                                              | Mecanismo                | Estado RED                       |
| ------------------------------------------------- | ------------------------ | -------------------------------- |
| `req_202_form_rejects_empty_concepto`             | render + click + onSubmit| IMPORT-FAIL: `../TransaccionForm` no existe |
| `req_202_form_rejects_negative_value`             | render + click + onSubmit| IMPORT-FAIL                       |
| `req_202_form_rejects_zero_value`                 | render + click + onSubmit| IMPORT-FAIL                       |
| `req_202_form_calls_on_submit_with_centavos`      | render + type + click    | IMPORT-FAIL                       |

El test #4 es el **cierre del loop REQ-202**: la cadena completa
`"1.500.000,50" → parseAmount → toCentavos → onSubmit(valor_centavos)`
debe entregar **150000050** como entero, no `1500000.5`. Si la fase IMPL
olvida la conversión, este test falla con un mensaje accionable.

> **Nota sobre el harness**: el proyecto no tiene `@testing-library/react`
> instalado y la regla dura #2 prohíbe agregar dependencias. El test usa
> `ReactDOM.createRoot` directamente con `act()` y `document.querySelector`
> — es deliberadamente minimalista para no introducir toolchain. Cuando
> la IMPL agregue `TransaccionForm`, los helpers `typeValue` /
> `typeConcepto` ya están listos para reutilizarse desde otros tests
> de molecules en slices futuros.

## 4. Decisiones de diseño de los tests

1. **Backend y frontend en paralelo**. El mismo REQ-202 vive en dos
   archivos: el Rust garantiza que el modelo de datos aguanta las
   invariantes (centavos, CHECKs, FK), y el TS garantiza que la frontera
   de usuario no las rompe (formato, validación, redondeo). Si uno solo
   pasa, el bug está en la otra capa.

2. **Decimal para todo cálculo monetario en TS**. Los tests pinean el
   uso de `decimal.js` (vía `Decimal` re-exportado desde
   `src/domain/precision/money`) en lugar de `Number`. La razón está
   en `design.md` §8.2: 28 dígitos de precisión contra el `INTEGER`
   SQLite, redondeo bancario `ROUND_HALF_EVEN`.

3. **`apply_all` como base del fixture**. Los tests Rust reusan el
   símbolo `crate::migrations::apply_all` que Slice 2 ya pineó. Esto
   valida de paso que la fase IMPL de Slice 2 cerró la firma esperada
   y que el runner es idempotente (aplicable a un DB fresca).

4. **Tests que pasan hoy, intencionalmente**. Los tests preexistentes
   en `src/__tests__/precision.test.ts` y `smoke.test.ts` siguen
   pasando — son guard tests contra regresiones. **No** se modifican.

5. **Errores tipados vs. errores runtime**. Para
   `req_203_rejects_invalid_frecuencia` se usa `as any` para forzar el
   branch runtime. La fase IMPL debe defenderse en runtime porque el
   `string` viene de una fila de SQLite que puede tener valores previos
   a una migración (un test de integración es lo que blinda este caso
   de borde).

6. **No se agregan dependencias**. Los 4 archivos compilan contra el
   `package.json` y `Cargo.toml` actuales. La fase IMPL tampoco necesita
   agregar nada para hacer GREEN — el `decimal.js` ya está como
   dependencia directa.

## 5. Cómo se llega a GREEN

La fase IMPL (delegada a otro agente) debe:

### Backend (Rust)

1. Crear `src-tauri/src/transacciones/repo.rs` (o `src-tauri/src/transacciones.rs`)
   exportando:

   ```rust
   pub struct TransaccionInput { /* ver firma pineada en el test */ }
   pub struct Transaccion { /* ver firma pineada en el test */ }

   pub fn insert(conn: &Connection, t: &TransaccionInput) -> rusqlite::Result<i64>
   pub fn list_by_user(conn: &Connection, usuario_id: i64) -> rusqlite::Result<Vec<Transaccion>>
   pub fn update(conn: &Connection, id: i64, t: &TransaccionInput) -> rusqlite::Result<Transaccion>
   pub fn delete(conn: &Connection, id: i64) -> rusqlite::Result<()>
   ```

2. Agregar `pub mod transacciones;` (o `pub mod transacciones { pub mod repo; pub use repo::*; }`)
   a `src-tauri/src/lib.rs`. Eso basta para que los `use
   app_diagnostico_financiero_local_lib::transacciones::repo::...`
   resuelvan.

3. Implementar las funciones usando `conn.prepare()` + `query_row` /
   `query_map` y devolver `rusqlite::Error` sin envolver (los tests
   assertan `is_err()`).

### Frontend (TypeScript)

1. Crear `src/domain/normalizacion/index.ts` con `valorMensual` y
   `valorAnual` usando `new Decimal(valorCentavos).div(FACTORES[f])` y
   `.mul(12)` respectivamente. Exportar `Frecuencia` como type union.

2. Extender `src/domain/precision/money.ts` (NO reemplazarlo — la regla
   dura #3 prohíbe borrar) agregando 3 exports:

   ```ts
   export function parseAmount(input: string): number
   export function toCentavos(monto: number): number
   export function formatCentavos(centavos: number): string
   ```

   `parseAmount` debe distinguir entre `.` (agrupación) y `,` (decimal).
   `formatCentavos` debe producir `"1.500.000,50"` con separador español.

3. Crear `src/components/molecules/TransaccionForm.tsx` con la prop
   `onSubmit` que recibe `valor_centavos` ya convertido a entero. El
   form debe usar `parseAmount` + `toCentavos` antes de invocar
   `onSubmit` (regla REQ-202).

### Convención de nombres

Si la fase IMPL prefiere los nombres del diseño (`mensualizar` /
`anualizar`), puede hacer:

```ts
export { mensualizar as valorMensual, anualizar as valorAnual } from './mensualizar'
```

…sin tocar los tests.

## 6. Riesgos conocidos

- **Drift de IEEE-754 en anualización**: si la fase IMPL usa `Number`
  en vez de `Decimal` en `valorAnual`, el test #8 falla con el mensaje
  `Expected: "99999996", Received: "99999996.00000001"` o similar.
  Diseño §8.2 es explícito: todo cálculo intermedio en `Decimal`.

- **Tests de formularios sin testing-library**: el harness minimalista
  puede romperse si la IMPL elige una librería UI exótica (por ejemplo
  headless components con portal). Si eso ocurre, la IMPL debe ajustar
  `typeValue`/`typeConcepto`/`clickSubmit` para apuntar a los selectores
  reales (los nombres `input[name="..."]` son **sugeridos**, no
  contractuales — el contrato es el comportamiento, no el selector).

- **`apply_all` requiere `rusqlite`**: el fixture Rust asume que
  `crate::migrations::apply_all(&conn)` ya existe con la firma
  pineada en Slice 2. Si Slice 2 todavía no cerró GREEN, los tests de
  Slice 3 heredarán un segundo fallo de compile. Revisar el plan de
  Slice 2 antes de apply.

## 7. Estado de esta fase

> **Esta es la fase RED. La fase IMPL se delega en un agente separado.
> Los tests actualmente fallan al compilar (Rust) y al resolver imports
> / ejecutar (Vitest).**

Comprobado en `cargo test --no-run` (filtrado):

```
error[E0433]: cannot find `transacciones` in `app_diagnostico_financiero_local_lib`
  --> tests\transacciones_repo_test.rs:34:43
   |
34 | use app_diagnostico_financiero_local_lib::transacciones::repo::{
   |                                           ^^^^^^^^^^^^^ could not find `transacciones` in `app_diagnostico_financiero_local_lib`

error: could not compile `app-diagnostico-financiero-local` (test "transacciones_repo_test") due to 1 previous error
```

Comprobado en `pnpm test` (resumen):

```
 Test Files  3 failed | 2 passed (5)
      Tests  5 failed | 5 passed (10)
```

Los 3 archivos que fallan:
- `src/components/molecules/__tests__/TransaccionForm.test.tsx` — import sin resolver (`../TransaccionForm` no existe).
- `src/domain/normalizacion/__tests__/index.test.ts` — import sin resolver (`..` apunta a un directorio sin `index.ts`).
- `src/domain/precision/__tests__/money-form.test.ts` — 5 tests fallan en runtime con `parseAmount is not a function` / `toCentavos is not a function` / `formatCentavos is not a function`.

Los 2 archivos que pasan son guard tests preexistentes
(`smoke.test.ts`, `precision.test.ts`) y no se tocan en esta fase.