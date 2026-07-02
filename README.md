# MVP Financiero Local-First

Aplicación de escritorio para gestión financiera personal construida con **Tauri v2 + React 18 + TypeScript**, con persistencia **local-first** en SQLite y cálculos precisos con `decimal.js`.

> Documentación funcional y arquitectónica: ver `openspec/changes/mvp-financiero-local-first/`.
> Análisis de la plantilla financiera de origen: `docs/analisis-plantilla-financiera.md`.

---

## Estado

| Slice | PR  | Tareas                                              | Estado    |
| ----- | --- | --------------------------------------------------- | --------- |
| 1     | #1  | T-101 → T-103 (scaffolding + boot)                  | este PR   |
| 2     | #2  | T-104 → T-106 + T-201 (SQLite + comandos)           | pendiente |
| 3     | #3  | T-202 → T-205 (captura transaccional)               | pendiente |
| 4     | #4  | T-301 → T-304 (dashboard y presupuesto)             | pendiente |
| 5     | #5  | T-401 → T-405 (simulador)                           | pendiente |
| 6     | #6  | T-501 → T-503 + T-X01 + T-X02 (KPIs y golden tests) | pendiente |

---

## Requisitos previos

- **Node.js 20+** y **pnpm 9+**
- **Rust** (stable, instalado vía [rustup](https://rustup.rs))
- **Windows**: WebView2 Runtime (preinstalado en Windows 11) y MSVC Build Tools

En Windows, después de instalar Rust con winget o rustup-init, **reiniciar la terminal** para que `cargo` esté en el `PATH` de la nueva shell. Si `pnpm tauri dev` falla con `program not found` para `cargo`, usar `scripts\tauri-dev.cmd` (wrapper que agrega `~/.cargo/bin` al `PATH`).

---

## Instalación

```bash
pnpm install
```

Si pnpm pregunta por builds nativos aprobados, ejecutar:

```bash
pnpm approve-builds esbuild
```

---

## Desarrollo

Levanta el backend de Tauri (Rust) + el dev server de Vite + el WebView:

```bash
pnpm tauri dev
# o en Windows, si cargo no está en PATH:
scripts\tauri-dev.cmd
```

Build de producción:

```bash
pnpm tauri build
```

---

## Tests

```bash
# Frontend (Vitest + jsdom)
pnpm test
pnpm test:watch

# Backend Rust
cd src-tauri && cargo test
```

---

## Arquitectura (resumen)

```
src/                   Frontend React 18 + TypeScript + Vite + Tailwind
  domain/              Lógica pura (normalización, agregaciones, KPIs, precisión)
  components/          Atomic design (atoms → molecules → organisms → pages)
  stores/              Estado global (Zustand, Slice 3+)
  db/, ipc/            Clientes de tauri-plugin-sql y comandos (Slice 2+)

src-tauri/             Backend Rust (Tauri v2)
  src/lib.rs           Entry point del binario
  capabilities/        Sandbox de permisos (mínimo: solo core:default)
  tauri.conf.json      Configuración de la app y bundle
```

Capacidades actuales: **solo `core:default`**. No hay `fs:`, `shell:`, `http:`. El acceso a la base de datos se hace exclusivamente vía `tauri-plugin-sql`, habilitado en su propio capability (Slice 2).

---

## Convenciones

- **Ramas**: `feat/ep{N}-{slug-epica}` (nunca commit directo a `main`).
- **Commits**: Conventional Commits en español, scope en español. Ejemplos en `openspec/changes/mvp-financiero-local-first/tasks.md` §B.
- **Idioma de artifacts**: código, identificadores, comentarios y UI en inglés salvo que se indique lo contrario.
- **Idioma de commits y docs de usuario**: español neutro.

---

## Licencia

Privado. Todos los derechos reservados.
