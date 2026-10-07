# Proposal: SQLite Database Backup and Restore

## Summary

This change introduces local database backup and restore capabilities for Balance Financiero.
Users can create verified `.db` snapshots of `misfinanzas.db` using SQLite's native online backup API and restore existing backups with integrity and schema validation, accompanied by destructive confirmation modals in the UI.

## Motivation & Value

As a local-first desktop application, the user's financial records live entirely on their local machine.
Providing a rock-solid, atomic backup and restore mechanism ensures data portability across devices and safeguards against machine crashes, formatting, or OS corruption.

## Capabilities

1. **Native SQLite Online Backup**:
   - Uses `rusqlite::backup::Backup` for page-by-page atomic copies.
   - Eliminates risks of file locking or incomplete snapshots caused by concurrent WAL writes.
2. **Schema & Integrity Verification**:
   - Pre-restore validation checking `PRAGMA integrity_check` and ensuring mandatory tables exist (`Usuarios`, `Categorias`, `Transacciones`, `_migrations`).
   - Re-enforces `PRAGMA foreign_keys = ON;` and runs any pending migrations on restore.
3. **User Experience**:
   - Native file dialogs for save and open (`@tauri-apps/plugin-dialog`).
   - Destructive confirmation dialog before restoring to prevent accidental data loss.
   - Reactive re-hydration of all local states (profiles, transactions, simulations).
