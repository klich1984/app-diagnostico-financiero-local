# Design: Backup & Restore Architecture

## Technical Approach

Following the established architecture:
- React frontend orchestrates UI without React Router.
- Typed IPC wrappers in `src/data/tauri-commands.ts`.
- Pure, headless backend functions (`src-tauri/src/backup.rs`) decoupled from the Tauri runtime for deterministic integration testing.
- Registered IPC commands in `src-tauri/src/commands.rs` and `src-tauri/src/lib.rs`.

## Architecture Decisions

| Decision | Alternative | Rationale |
|---|---|---|
| Use `rusqlite::backup::Backup` | File copy via `std::fs::copy` | Native backup guarantees ACID snapshot even under active WAL mode and active connections; plain file copy can yield corrupted or locked files. |
| Strict Schema Validation (`validar_archivo_backup`) | Trust source file directly | Prevents restoring arbitrary SQLite files, damaged files, or databases from other applications. |
| Dedicated Service Layer (`src/data/backup-service.ts`) | Direct invoke in UI | Encapsulates dialog interaction (`@tauri-apps/plugin-dialog`) keeping UI components focused on rendering. |
| Destructive confirmation modal in React | Native browser `confirm()` | Tauri WebViews block synchronous `window.confirm()`; modal guarantees explicit user intent. |

## Data Flow

```text
Sidebar ──onClick──> App.tsx
  ├─ Backup: backup-service.ts ──save()──> tauri-commands.ts ──cmd_exportar_backup──> backup.rs (online backup)
  └─ Restore: App modal confirmation ──backup-service.ts ──open()──> tauri-commands.ts ──cmd_restaurar_backup──> backup.rs (validate + restore) ──refetch──> State reload
```
