# Diseño Técnico: Cierre MVP — Modal Salario Objetivo + 5ª Tab Presupuesto Mejorado

> **Trazabilidad**: este documento es ejecutable. La fase `sdd-apply` lo lee como blueprint y comienza a codificar. Las decisiones bloqueadas están en `proposal.md`; los 20 escenarios (11 D1 + 8 D2 + 1 REQ-605) están en `spec.md`. Este change **extiende** el baseline arquitectónico de `openspec/changes/mvp-financiero-local-first/design.md` (referencia) — no renegocia nada.
>
> **Reglas duras del usuario (inmutables)**: ver §10 al final.

---

## 1. Resumen del cambio

Dos deliverables cortos sobre la base arquitectónica ya mergeada (Tauri v2 + Rust IPC + React + atomic design + `decimal.js` + `parsePesosInput` + `calcularMatrizMejorada`):

- **D1 — Modal salario objetivo (HU-502 UI)**: nuevo organism `ModalSalarioObjetivo` disparado desde `EstadoResultadosPanel`; persiste vía el nuevo comando `cmd_update_salario_objetivo`. No recalcula nada: el motor de KPIs ya descuenta el salario del lado Mejorado (REQ-502 motor está cerrado).
- **D2 — 5ª tab "Presupuesto Mejorado"**: nueva tab en el nav de `App.tsx` + nuevo organism `PresupuestoMejoradoPanel` que **reusa** `calcularMatrizMejorada` (golden `6,275,000.00` ya validado) sin re-implementar el left-join. Mismo patrón que la tab Presupuesto existente.

No hay migración de schema (columna `salario_personal_objetivo_centavos` ya en `001_inicial.sql`). No hay nueva dependencia npm ni crate. No se introduce React Router ni `@testing-library/react`.

---

## 2. Decisiones arquitectónicas

| # | Decisión | Alternativas | Por qué esta |
|---|---|---|---|
| D1 | **Trigger del modal en `EstadoResultadosPanel`**, no en `SelectorPerfil` | Mover al selector (perfil DUMB) / mover al chip del header | El selector es DUMB y se re-muestra solo al abrir la app; el panel de Resultados es donde el usuario revisa el valor. Replica la decisión bloqueada #7 del proposal. |
| D2 | **Reusar `calcularMatrizMejorada` en D2 vía `useMemo`** | Re-implementar en el organism / delegar a `calcularMatriz` y aplicar sims manualmente | El golden test de `matriz-mejorada.test.ts` es la fuente de verdad; delegar mantiene "una sola capa de cálculo" (regla del design §1). |
| D3 | **Cmd IPC = thin wrapper `_impl` + `#[tauri::command]`** | Un solo `cmd_*` con lógica inline | Mismo patrón que `cmd_obtener_perfiles` y `cmd_upsert_simulacion`. Permite `cargo test` sin runtime Tauri. |
| D4 | **Validación de centavos en backend (`<= 100_000_000_000`)** | Solo validar en frontend | Defensa en profundidad (regla del design §14.4). El modal también valida para no malgastar el IPC. |
| D5 | **Payload del cmd envuelto bajo `{ input: {...} }`** | Top-level keys | Convención del proyecto pineada por `crearPerfil` y `upsertSimulacion` (ver `tauri-commands.ts` líneas 207 y 304). |
| D6 | **Tabla `ModalSalarioObjetivo` props = controladas, sin `onChange` externos** | Props totalmente controladas con `value`/`onChange` por el padre | Estado local del modal: el padre solo recibe el resultado final de `onGuardar`. Menos re-renders del padre al tipear. |
| D7 | **Modal reusa el patrón full-screen overlay de `SelectorPerfil` (`fixed inset-0 z-50`)** | Modal estilo Material UI / modal portal | Réplica exacta del patrón existente; sin dependencias nuevas. |
| D8 | **State del modal (`modalAbierto`) vive en `EstadoResultadosPanel`, no en `App.tsx`** | Subir a `App.tsx` | El modal pertenece al panel; si fuera a `App`, la prop chain se infla sin valor. El padre solo expone `onSalarioGuardado`. |

---

## 3. Contratos por componente

### 3.1 ModalSalarioObjetivo (nuevo organism)

```ts
interface ModalSalarioObjetivoProps {
  salarioActualCentavos: number | null  // pre-load del input
  onGuardar: (centavos: number) => Promise<void>  // throws si IPC falla
  onCancelar: () => void
  perfilActivoId: number | null  // null → modal no se monta
}
// State local:
//   inputTexto: string          // raw "1.500.000"
//   errorValidacion: string | null
//   errorIpc: string | null     // cuando onGuardar rechaza
//   guardando: boolean
// Lifecycle:
//   useEffect: pre-cargar formatCentavos(salarioActualCentavos) al montar
//   useEffect: cuando perfilActivoId cambia, llamar onCancelar() (REQ-502-D1-8)
// Validación (sync):
//   empty          → "Ingresa un valor"        + Guardar disabled
//   parsePesosInput === null → "El valor no puede ser negativo"
//   centavos > 1e11 → "El valor excede el máximo permitido"
```

`data-testid`: `modal-salario-objetivo`, `btn-guardar-salario`, `btn-cancelar-salario`, `input-salario`, `error-validacion`, `error-ipc`.

### 3.2 EstadoResultadosPanel (modificado)

```ts
interface EstadoResultadosPanelProps {
  estado: EstadoResultados
  salarioObjetivoCentavos: number | null
  perfilActivoId: number | null                  // NUEVO (REQ-502-D1-1, D1-11)
  onSalarioGuardado: (centavos: number) => Promise<void>  // NUEVO
}
// State local nuevo: modalAbierto: boolean
// Render condicional del botón "Editar salario":
//   salarioObjetivoCentavos !== null && perfilActivoId !== null
//   → botón `data-testid="btn-editar-salario"` que setea modalAbierto=true
// Cuando modalAbierto:
//   <ModalSalarioObjetivo
//     salarioActualCentavos={salarioObjetivoCentavos}
//     onGuardar={async (cents) => { await onSalarioGuardado(cents); setModalAbierto(false) }}
//     onCancelar={() => setModalAbierto(false)}
//     perfilActivoId={perfilActivoId}
//   />
```

### 3.3 PresupuestoMejoradoPanel (nuevo organism)

```ts
interface PresupuestoMejoradoPanelProps {
  transacciones: TransaccionCompletaDto[]
  categorias: CategoriaDto[]
  simulaciones: SimulacionCompletaDto[]
  onIrATransacciones: () => void  // CTA empty-state
}
// useMemo matrizMejorada = calcularMatrizMejorada(transacciones as never, catsMin, simsMin)
// useMemo totalGastos = matrizMejorada.totalGastos.toNumber()
// useMemo totalIngresos = matrizMejorada.totalIngresos.toNumber()  // ≈ $7.200.000,00
// useMemo delta = matrizInicial.totalGastos - totalGastos
// Render:
//   transacciones.length === 0  → empty-state + botón onIrATransacciones
//   else                         → banner si simulaciones.length === 0
//                                + matriz mejorada (mismo render que MatrizPresupuesto)
//                                + KPI strip (Total Ingresos, Total Gastos, Delta, FCL)
```

`data-testid`: `presupuesto-mejorado-panel`, `kpi-total-gastos-mejorado`, `banner-sin-simulaciones`, `empty-state-mejorado`, `btn-ir-transacciones`.

### 3.4 cmd_update_salario_objetivo (Rust, en `commands.rs`)

```rust
#[derive(Debug, serde::Deserialize)]
pub struct UpdateSalarioObjetivoInput {
    pub perfil_id: i64,
    pub salario_objetivo_centavos: i64,
}

pub fn cmd_update_salario_objetivo_impl(
    conn: &Connection,
    perfil_id: i64,
    salario_objetivo_centavos: i64,
) -> Result<UsuarioDto, String> {
    if salario_objetivo_centavos < 0 {
        return Err("salario negativo".into());
    }
    if salario_objetivo_centavos > 100_000_000_000 {
        return Err("excede máximo".into());
    }
    let rows = conn.execute(
        "UPDATE Usuarios SET salario_personal_objetivo_centavos = ?1 WHERE id = ?2",
        rusqlite::params![salario_objetivo_centavos, perfil_id],
    ).map_err(|e| format!("update Usuario: {e}"))?;
    if rows == 0 {
        return Err(format!("perfil {perfil_id} no existe"));
    }
    cmd_obtener_perfil_impl(conn, perfil_id)  // reusa el _impl existente
}

#[tauri::command]
pub async fn cmd_update_salario_objetivo(
    app: tauri::AppHandle,
    input: UpdateSalarioObjetivoInput,
) -> Result<UsuarioDto, String> { /* abre conn + delega */ }
```

Registro en `src-tauri/src/lib.rs::invoke_handler` (sumar una línea al array).

### 3.5 Wrapper TS (`src/data/tauri-commands.ts`)

```ts
export async function actualizarSalarioObjetivo(
  perfilId: number,
  centavos: number,
): Promise<UsuarioDto> {
  return invoke<UsuarioDto>('cmd_update_salario_objetivo', {
    input: { perfil_id: perfilId, salario_objetivo_centavos: centavos },
  })
}
```

### 3.6 App.tsx — diffs mínimos

```ts
type TabActiva = 'transacciones' | 'presupuesto' | 'simulador'
              | 'presupuesto-mejorado' | 'resultados'  // NUEVO

// handler NUEVO:
const handleSalarioGuardado = async (cents: number): Promise<void> => {
  await actualizarSalarioObjetivo(perfilActivo!, cents)
  setSalarioObjetivoCentavos(cents)
  // también refresca `perfiles` para que el chip del header muestre el nuevo valor
  const ps = await obtenerPerfiles()
  setPerfiles(Array.isArray(ps) ? ps : [])
}

// nav: NUEVO botón `data-testid="tab-presupuesto-mejorado"` entre Simulador y Resultados

// render NUEVO:
{tabActiva === 'presupuesto-mejorado' && perfilActivo !== null ? (
  <PresupuestoMejoradoPanel
    transacciones={transacciones}
    categorias={categorias}
    simulaciones={simulaciones}
    onIrATransacciones={() => setTabActiva('transacciones')}
  />
) : null}

// EstadoResultadosPanel: agregar props perfilActivoId + onSalarioGuardado
```

---

## 4. Flujo de datos

### 4.1 Modal salario (D1)

```
User: click "Editar salario"
  └─→ EstadoResultadosPanel.setModalAbierto(true)
       └─→ ModalSalarioObjetivo monta con salarioActualCentavos

User: tipea "1.500.000"
  └─→ inputTexto actualiza
       └─→ validacion sync: parsePesosInput === 150000000 ✓
            └─→ Guardar habilitado

User: click "Guardar"
  └─→ onGuardar(150000000) ← async
       ├─→ try actualizarSalarioObjetivo(perfilActivo, 150000000)
       │    └─→ IPC cmd_update_salario_objetivo({ input: {...} })
       │         └─→ Rust UPDATE Usuarios SET salario_… = ? WHERE id = ?
       │              └─→ SELECT fila → UsuarioDto
       ├─→ setSalarioObjetivoCentavos(150000000)   # App.tsx state
       ├─→ setPerfiles(await obtenerPerfiles())     # refresca chip
       └─→ setModalAbierto(false)                  # cierra

IPC error: catch → setErrorIpc(mensaje) → modal sigue abierto
```

### 4.2 5ª tab Presupuesto Mejorado (D2)

```
User: click tab "presupuesto-mejorado" (data-testid="tab-presupuesto-mejorado")
  └─→ App.tsx setTabActiva('presupuesto-mejorado')
       └─→ render PresupuestoMejoradoPanel
            └─→ useMemo calcularMatrizMejorada(transacciones, catsMin, simsMin)
                 └─→ reusa calcularMatrizMejorada (NO recalcula) ← golden 6,275,000.00
            └─→ render matriz + KPI strip + (banner si simulaciones.length === 0)
```

---

## 5. Cambios por archivo

| Archivo | Acción | Líneas est. | Por qué |
|---|---|---|---|
| `src/components/organisms/ModalSalarioObjetivo.tsx` | crear | 110-150 | Nuevo organism D1 |
| `src/components/organisms/__tests__/ModalSalarioObjetivo.test.tsx` | crear | 200-280 | RED 11 escenarios REQ-502-D1-* |
| `src/components/organisms/EstadoResultadosPanel.tsx` | modificar | +30 | State `modalAbierto` + render condicional del botón + props nuevas |
| `src/components/organisms/__tests__/EstadoResultadosPanel.test.tsx` | modificar | +60 | Escenarios D1-1 (botón visible) + D1-11 (no visible) |
| `src/components/organisms/PresupuestoMejoradoPanel.tsx` | crear | 100-140 | Nuevo organism D2 (sin gráficos; tabla + KPIs) |
| `src/components/organisms/__tests__/PresupuestoMejoradoPanel.test.tsx` | crear | 180-260 | RED 8 escenarios REQ-403-D2-* + REQ-605-D2-1 |
| `src/App.tsx` | modificar | +20 | 5ª tab en nav + case en render + handler `handleSalarioGuardado` |
| `src/data/tauri-commands.ts` | modificar | +10 | `actualizarSalarioObjetivo` wrapper |
| `src/data/__tests__/tauri-commands.test.ts` | modificar | +40 | Escenario wrapper actualizarSalarioObjetivo |
| `src-tauri/src/commands.rs` | modificar | +50 | `cmd_update_salario_objetivo` + `UpdateSalarioObjetivoInput` |
| `src-tauri/src/lib.rs` | modificar | +1 | Sumar `cmd_update_salario_objetivo` a `invoke_handler` |
| `src-tauri/tests/usuarios_update_test.rs` | crear | 80-120 | 4 RED tests: update ok / negativo / > 1e11 / perfil inexistente |
| `openspec/changes/mvp-financiero-local-first/MVP-COMPLETE.md` | modificar | doc | Marcar HU-502 ✅ + tab Presupuesto Mejorado ✅ |

**Total**: 5 nuevos (3 impl + 2 tests) + 6 modificados. ≈ 700-900 líneas agregadas, sobre el límite de 400 del Review Workload Guard — **aplicar chained PR strategy (slice A + slice B)**.

---

## 6. Estrategia de tests (RED antes de impl)

| Capa | Archivo | Escenarios | Patrón |
|---|---|---|---|
| Unit frontend | `__tests__/ModalSalarioObjetivo.test.tsx` | 11 (REQ-502-D1-1..11) | `react-dom/client` + `createRoot` + `act()` (sin `@testing-library/react`) |
| Unit frontend | `__tests__/EstadoResultadosPanel.test.tsx` (modif) | +2 (D1-1, D1-11) | mismo patrón + `vi.mock` para `@tauri-apps/api/core` si el modal dispara IPC durante el render del padre |
| Unit frontend | `__tests__/PresupuestoMejoradoPanel.test.tsx` | 9 (REQ-403-D2-1..8 + REQ-605-D2-1) | mismo patrón |
| Wrapper TS | `src/data/__tests__/tauri-commands.test.ts` | +1 | `vi.mock('@tauri-apps/api/core', ...)` — mismo patrón que `upsertSimulacion` |
| Unit backend | `src-tauri/tests/usuarios_update_test.rs` | 4 | `cargo test` contra `apply_all(&conn)` in-memory |
| Golden (ya existe) | `src/domain/simulador/__tests__/matriz-mejorada.test.ts` | 6 | sigue siendo la fuente de verdad del cálculo — NO se duplica |

**Total previsto**: 206 tests previos + **27 nuevos** = 233 verde al cierre.

---

## 7. Migración / Rollout

**No requiere migración**. La columna `salario_personal_objetivo_centavos` ya existe en `Usuarios` desde `src-tauri/migrations/001_inicial.sql` línea 178. Verificado en `commands.rs` líneas 229 y 301 (el `cmd_crear_perfil_impl` ya escribe esa columna).

**No requiere feature flag**. El cambio es backward-compatible: el modal es opcional (botón solo visible si `salarioObjetivoCentavos !== null`). El IPC `cmd_update_salario_objetivo` es aditivo.

**Estrategia de PR (Review Workload Guard §E)**: forecast ~700-900 líneas agregadas. → **`chained PRs recommended: Yes`**, **`400-line budget risk: High`**. Plan:

- **Slice A — D1 modal salario objetivo**: Rust command + wrapper TS + organism Modal + integración en `EstadoResultadosPanel` + 3 archivos de test (nuevo `ModalSalarioObjetivo.test.tsx`, nuevo `usuarios_update_test.rs`, modificado `EstadoResultadosPanel.test.tsx` y `tauri-commands.test.ts`). ≈ 350-450 líneas.
- **Slice B — D2 5ª tab Presupuesto Mejorado**: organism `PresupuestoMejoradoPanel` + integración en `App.tsx` + 1 archivo de test nuevo. ≈ 300-400 líneas.

Slice A targetea `main`; Slice B puede ir en paralelo (no depende del command Rust, solo del state ya existente de `simulaciones`). La regla "stacked-to-main" del proposal §7 se mantiene: ambos targetean `main` con PRs independientes.

---

## 8. Riesgos abiertos / Verificaciones pre-apply

| # | Riesgo | Mitigación / verificación |
|---|---|---|
| R-1 | El wrapper `actualizarSalarioObjetivo` debe usar camelCase en el payload o snake_case | El design pineó `{ input: { perfil_id, salario_objetivo_centavos } }` (snake_case, sin `rename_all`). Confirmar en el test RED: `expect(invokeMock).toHaveBeenCalledWith('cmd_update_salario_objetivo', { input: { perfil_id: ..., salario_objetivo_centavos: ... } })`. El struct Rust NO lleva `#[serde(rename_all)]` → keys snake_case. |
| R-2 | El test del organism `ModalSalarioObjetivo` necesita mockear `@tauri-apps/api/core` si el padre pasa IPC async durante render | El `ModalSalarioObjetivo` NO llama IPC directo; solo dispara `onGuardar` (callback del padre). El padre (`EstadoResultadosPanel`) llama `actualizarSalarioObjetivo`. Si el test del modal solo valida que `onGuardar(centavos)` se invoca con el valor correcto, NO necesita mock. Si el test valida el flujo completo padre→modal→IPC, sí. **Decisión**: el test del modal valida el callback; el test de integración del padre sí mockea IPC. |
| R-3 | `parsePesosInput` ya rechaza `< 0` (ver `money-form.test.ts` línea 177) | El modal solo muestra "El valor no puede ser negativo" cuando `parsePesosInput` retorna `null`. Cobertura ya validada — sin riesgo. |
| R-4 | El `data-testid="btn-editar-salario"` debe renderizarse SOLO si `salarioObjetivoCentavos !== null && perfilActivoId !== null` (REQ-502-D1-1 + D1-11) | Test cubre ambos branches (con y sin perfil). El subtítulo existente (línea 42-46) sigue como está — el botón va **debajo** del subtítulo. |
| R-5 | Cambio de perfil mientras modal abierto (REQ-502-D1-8) | `useEffect` que dispara `onCancelar()` cuando `perfilActivoId` cambia. Cubierto por test RED. |
| R-6 | `calcularMatrizMejorada` requiere `TransaccionMin[]` con `id` opcional; el DTO `TransaccionCompletaDto` SÍ trae `id` | El organism castea `transacciones as never` igual que `App.tsx` línea 165. Mismo patrón que el resto del codebase — sin riesgo. |
| R-7 | El test `presupuesto_mejorado_panel` valida KPI golden `6,275,000.00` (REQ-605-D2-1) | El valor es exacto: el test importa la misma fixture `transacciones32()` (NO la duplicamos) o construye una mini-fixture equivalente. Decisión: mini-fixture mínima para no acoplar el test del organism al archivo de 32 filas. |
| R-8 | El archivo de test wrapper es `src/data/__tests__/tauri-commands.test.ts`, NO `src/__tests__/tauri-commands.test.ts` como dice el spec §1.1 | Documentado: el spec tiene una errata de path. El test nuevo va en `src/data/__tests__/tauri-commands.test.ts` (path real). |

---

## 9. Decisiones técnicas que requieren confirmación

Estas decisiones heredan del baseline (`design.md` §18 del change anterior) y no requieren renegociación salvo disidencia explícita. Las marco para visibilidad:

1. **Reuso de `cmd_obtener_perfil_impl` dentro de `cmd_update_salario_objetivo_impl`** para proyectar el `UsuarioDto` post-UPDATE. Alternativa: duplicar el `SELECT` (10 líneas más). **Recomendación**: reusar para mantener una sola proyección. **¿OK?**
2. **Position del botón "Editar salario"**: debajo del subtítulo (línea 42-46 actual), a la derecha del texto. Alternativa: como ícono de edición al lado del subtítulo. **Recomendación**: botón de texto claro, mismo set que `Cambiar perfil` del header. **¿OK?**
3. **`simulaciones` state ya existe en `App.tsx` (línea 156)**: confirmado por lectura directa del archivo. NO requiere agregar state nuevo. **OK.**
4. **`App.tsx` línea 149 — `type TabActiva`**: agregar `'presupuesto-mejorado'` como 4° miembro (entre `'simulador'` y `'resultados'`). TypeScript exhaustiveness en el render funciona porque cubrimos los 5 miembros. **OK.**

Si alguna respuesta es "no", se reabre la conversación antes de pasar a `sdd-tasks`.

---

## 10. Reglas duras del usuario (recordatorio inmutable)

Replicadas del baseline `design.md` §19 sin cambios:

1. **Feature branches + PR**. No commits directos a `main`.
2. **Conventional Commits** en español neutro, sin Co-Authored-By de IA.
3. **No borrar nada sin consentimiento explícito** — el cambio es 100% aditivo (sin `git rm`, sin `DROP`, sin reset de DB).
4. **El usuario revisa y corre tests por su cuenta**. `sdd-apply` espera confirmación entre PRs.

---

## 11. Referencias cruzadas

| Tema | Documento |
|---|---|
| Qué se construye (alcance) | `proposal.md` §1-§7 |
| Requisitos formales (20 escenarios) | `spec.md` (11 D1 + 8 D2 + 1 REQ-605) |
| Decisiones de producto bloqueadas | `proposal.md` §3 (7 decisiones) |
| Riesgos y mitigaciones | `proposal.md` §8 |
| Arquitectura baseline | `openspec/changes/mvp-financiero-local-first/design.md` §1-§19 (referencia completa) |
| Tabla `Usuarios` + columna `salario_…` | `src-tauri/migrations/001_inicial.sql` línea 178 |
| Commands Rust sobre `Usuarios` (referencia) | `src-tauri/src/commands.rs` líneas 200-346 |
| Registro invoke_handler | `src-tauri/src/lib.rs` líneas 24-35 |
| `calcularMatrizMejorada` (reuso D2) | `src/domain/simulador/matriz-mejorada.ts` (golden 6,275,000.00) |
| Helper `parsePesosInput` (validación modal) | `src/domain/precision/money.ts` líneas 141-193 |
| Subtítulo actual del salario | `src/components/organisms/EstadoResultadosPanel.tsx` líneas 42-46 |
| Patrón de tests sin `@testing-library/react` | `src/components/organisms/__tests__/EstadoResultadosPanel.test.tsx` líneas 65-67 |
| State `simulaciones` ya en App | `src/App.tsx` línea 156 |
| Nav de tabs actual | `src/App.tsx` líneas 518-570 |
| Patrón de modal overlay | `src/components/organisms/SelectorPerfil.tsx` líneas 49-52 (`fixed inset-0 z-50`) |
| Estado actual `salarioObjetivoCentavos` | `src/App.tsx` línea 152 |

---

_Diseño listo. Próxima fase: `sdd-tasks`._
