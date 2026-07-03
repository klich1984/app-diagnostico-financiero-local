// Vitest setup file.
//
// React 18 emits the warning
//   "The current testing environment is not configured to support act(...)"
// unless `globalThis.IS_REACT_ACT_ENVIRONMENT` is `true` before any test
// imports React. Setting the flag here keeps the warning out of every
// component test in the suite.
//
// We intentionally do NOT depend on `@testing-library/react` here — this
// project renders components via `react-dom/client` + `createRoot`
// directly (see `TransaccionForm.test.tsx` for the pattern). Adding the
// flag is the minimal, dependency-free fix for the act() warning.

// @ts-expect-error - IS_REACT_ACT_ENVIRONMENT is a React internal flag, not in standard TS types.
globalThis.IS_REACT_ACT_ENVIRONMENT = true
