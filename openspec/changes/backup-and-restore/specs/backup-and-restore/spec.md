# Specification: SQLite Database Backup and Restore

## Requirements

### Requirement: REQ-BR-101 Export Database Backup
The application MUST allow the user to export a complete, atomic copy of the local SQLite database.

#### Scenario: Successful backup export
- GIVEN the application has active records in `misfinanzas.db`
- WHEN the user initiates "Crear Respaldo" and selects a destination path
- THEN the backend creates a valid SQLite backup containing all tables, profiles, and transactions
- AND reports a success message to the user.

#### Scenario: Cancelled backup export
- GIVEN the save file dialog is displayed
- WHEN the user cancels the dialog
- THEN no file is written and no success or failure alert is triggered.

---

### Requirement: REQ-BR-102 Restore Database Backup
The application MUST allow the user to restore an existing SQLite backup file into the active database, replacing current data safely.

#### Scenario: Pre-restore confirmation
- GIVEN the user clicks "Restaurar Respaldo" in the Sidebar
- WHEN the action is triggered
- THEN a destructive warning modal is shown informing that all current data will be overwritten
- AND the operation only proceeds if the user explicitly confirms.

#### Scenario: Successful restore
- GIVEN the user selects a valid backup file with the application schema
- WHEN restoration completes
- THEN the active database is atomically replaced
- AND `PRAGMA foreign_keys = ON;` is enforced
- AND the application refreshes all active profiles, transactions, and simulations.

#### Scenario: Invalid or corrupt backup file rejected
- GIVEN the user selects an arbitrary non-SQLite file, a corrupted database, or a database lacking application tables
- WHEN the backend validates the file
- THEN the restore operation is aborted with an error message
- AND the active database remains intact without any modifications.
