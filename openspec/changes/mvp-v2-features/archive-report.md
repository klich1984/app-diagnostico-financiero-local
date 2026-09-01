# SDD Archive: MVP V2 Features

## Final State
**Status:** COMPLETE & ARCHIVED
**Merged Into:** `main` (via PR #3 Tracker)
**Date:** 2026-09-01

## Summary of Accomplishments
The MVP V2 release successfully introduced core isolation, editing capabilities, and toggles to the application without breaking the strict IPC architecture or testing discipline.
1. **Transaction Editing (REQ-V2-101):** Full support for editing transactions without duplicating records. Rust backend enforces `usuario_id` ownership during `update`.
2. **Profile Management (REQ-V2-102):** Profiles can now be created, renamed, and securely deleted (cascading deletes for associated transactions and simulations). Real isolation implemented via `usuario_id` filtering in all queries.
3. **Enhanced Mode (REQ-V2-103):** React-state toggle to seamlessly switch the financial matrix and KPI engine between the base scenario and the enhanced budget scenario.
4. **Testing (Strict TDD):** Project maintained 170+ frontend React tests and 40+ Rust backend tests in `GREEN` state. All work was performed Red-Green-Refactor.

## Discoveries & Architecture Records
- **IPC Payload Protection:** Direct calls to Tauri's `invoke` from UI components are strictly prohibited. All communication routes through `src/data/tauri-commands.ts`.
- **Git Strategy:** Changes were sliced into Chained PRs targeting a tracker branch (`feat/mvp-v2-features`). Tracker PR was maintained until the full feature set was ready, then merged to `main`.
- **OpenCode Guidelines:** Project rules formalized in `.opencode.md` to prevent LLM drift on future tasks.

## Artifact Resolution
- **Proposal/Spec/Design:** Complete and aligned.
- **Tasks:** 20/20 tasks completed.
- **Verification:** Verified externally via CI equivalent (manual test running before tracker merge).