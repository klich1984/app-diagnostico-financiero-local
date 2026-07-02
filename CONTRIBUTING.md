# Contributing

## Workflow

This project follows a structured Spec-Driven Development (SDD) workflow with Behavior-Driven TDD.

## Commit conventions

All commits use [Conventional Commits](https://www.conventionalcommits.org/) in **English**:

| Type       | Use case                                | Example                                               |
| ---------- | --------------------------------------- | ----------------------------------------------------- |
| `feat`     | New feature or capability               | `feat: implement budget matrix aggregation`           |
| `fix`      | Bug fix                                 | `fix: handle zero-valued division in normalizer`      |
| `chore`    | Tooling, deps, config                   | `chore: install eslint and prettier plugins`          |
| `docs`     | Documentation only                      | `docs: update README with test commands`              |
| `test`     | Tests only (no production code)         | `test: add golden test for FA1 calculation`           |
| `refactor` | Code change that neither fixes nor adds | `refactor: extract money helper into separate module` |
| `style`    | Formatting only (use sparingly)         | `style: apply prettier formatting`                    |

Scope and subject in English. Description in Spanish when communicating with the team is OK (PR body, issues), but the commit subject line itself is always English.

Branch naming: `feat/<scope>`, `fix/<scope>`, `chore/<scope>`. Example: `feat/epic-2-captura`.

## Testing policy: Strict TDD (BDD variant by REQ)

Every requirement in `openspec/changes/mvp-financiero-local-first/spec.md` MUST have at least one Vitest (frontend) or `cargo test` (backend) scenario test **written before the implementation**.

### The cycle (per task)

1. **Red**: Write the failing test. Reference the REQ in the `describe` block:
   ```ts
   describe('REQ-201: precarga de categorías', () => {
     it('Given app is started, When categories table is queried, Then contains Hogar, Alimentación, ...', ...)
   })
   ```
2. **Green**: Write the minimal implementation to make the test pass.
3. **Refactor**: Clean up the implementation while keeping tests green.
4. **Commit in pairs**: `[test]` commit followed by `[impl]` commit. Both in the same task slice.

### REQ → Test mapping (19 REQs)

State key:

- ✅ covered
- 🔄 in progress (test exists, fails until impl merged)
- ⏳ pending test

| REQ          | Origin            | Test file                                  | State        |
| ------------ | ----------------- | ------------------------------------------ | ------------ |
| REQ-101      | HU-101            | `src/__tests__/smoke.test.ts`              | ✅           |
| REQ-102      | HU-102            | `src/__tests__/smoke.test.ts`              | ✅           |
| REQ-103      | HU-103            | `src/__tests__/smoke.test.ts`              | ✅           |
| REQ-104..106 | HU-103            | `src-tauri/tests/migrations.rs`            | ⏳ (Slice 2) |
| REQ-201      | HU-201            | `src/__tests__/categorias.test.ts`         | ⏳ (Slice 2) |
| REQ-202      | HU-202            | `src/__tests__/captura.test.ts`            | ⏳ (Slice 3) |
| REQ-203      | HU-203            | `src/__tests__/normalizacion.test.ts`      | ⏳ (Slice 3) |
| REQ-301      | HU-301            | `src/__tests__/presupuesto.test.ts`        | ⏳ (Slice 4) |
| REQ-302      | HU-302            | `src/__tests__/graficos.test.ts`           | ⏳ (Slice 4) |
| REQ-401      | HU-401            | `src/__tests__/simulador.test.ts`          | ⏳ (Slice 5) |
| REQ-402      | HU-402            | `src/__tests__/simulador-debounce.test.ts` | ⏳ (Slice 5) |
| REQ-403      | HU-403            | `src/__tests__/matriz-mejorada.test.ts`    | ⏳ (Slice 5) |
| REQ-501      | HU-501            | `src/__tests__/estado-resultados.test.ts`  | ⏳ (Slice 6) |
| REQ-502      | HU-502            | `src/__tests__/salario-objetivo.test.ts`   | ⏳ (Slice 6) |
| REQ-601..604 | product decisions | various                                    | ⏳           |
| REQ-605      | golden Excel      | `src/__tests__/golden.test.ts`             | ⏳ (Slice 6) |

## Other rules

- **No deletion without explicit consent.** STOP and ask before any `rm`, `git rm`, schema DROP, dependency removal.
- **No commits directly to `main`.** Always use a feature branch.
- **User reviews each slice.** No auto-approving phases. Wait for explicit confirmation.

## Development commands

```bash
# Install deps
pnpm install

# Dev server (Tauri window)
pnpm tauri dev

# Frontend tests
pnpm test            # run once
pnpm test:watch      # watch mode

# Backend tests
cd src-tauri && cargo test

# Format
pnpm format          # write
pnpm format:check    # verify (CI mode)

# Both test runners in sequence (PowerShell)
.\scripts\test-all.ps1
```
