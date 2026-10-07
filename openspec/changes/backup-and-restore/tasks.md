# Tasks: Backup and Restore Implementation

## Status
Completed: 2026-10-05

- [x] **Task 1: Backend Architecture & TDD (RED -> GREEN)**
  - Add integration tests in `src-tauri/tests/backup_test.rs`.
  - Enable `backup` feature in `rusqlite` (`Cargo.toml`).
  - Implement `exportar_backup_impl`, `validar_archivo_backup`, and `restaurar_backup_impl` in `src-tauri/src/backup.rs`.
  - Expose IPC commands `cmd_exportar_backup` and `cmd_restaurar_backup` in `src-tauri/src/commands.rs` and register in `src-tauri/src/lib.rs`.
- [x] **Task 2: Frontend Data Layer (RED -> GREEN)**
  - Implement typed wrappers `exportarBackup` and `restaurarBackup` in `src/data/tauri-commands.ts`.
  - Unit tests in `src/data/__tests__/tauri-commands.test.ts`.
  - Implement `src/data/backup-service.ts` for native dialogs with unit tests in `src/data/__tests__/backup-service.test.ts`.
- [x] **Task 3: User Interface & State Rehydration**
  - Add "Crear Respaldo" and "Restaurar Respaldo" in `src/components/organisms/Sidebar.tsx` with unit tests.
  - Wire destructive confirmation modal and data reload in `src/App.tsx`.
- [x] **Task 4: Verification & Reviews**
  - 86 Rust tests passing, 234 React tests passing.
  - Production build verified with code-splitting.
  - Native RDD review lineage `review-77f7353bbd503805` approved and burned.
