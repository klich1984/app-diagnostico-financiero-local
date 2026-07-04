// App.tsx — root component for the desktop shell.
//
// This is a DEMO integration of the `TransaccionForm` molecule so the
// user can launch `pnpm tauri dev` and see the capture surface end-to-end.
// It is NOT the final wiring — Slice 4 will introduce the categories
// store, the IPC bridge, and a real `onSubmit` handler that persists to
// the SQLite repository. For now the form's submit just `console.log`s
// the validated `TransaccionInput` so we can drive the UI manually.

import { TransaccionForm, type TransaccionInput } from './components/molecules/TransaccionForm'
import { CATEGORIAS_SEED } from './data/categorias-seed'

function App(): JSX.Element {
  // Demo handler: in Slice 4 this will dispatch to the IPC layer + store.
  const handleSubmit = (input: TransaccionInput): void => {
    // eslint-disable-next-line no-console
    console.log('Transaccion submitted:', input)
  }

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <section className="mx-auto max-w-2xl">
        <h1 className="mb-2 text-3xl font-bold text-slate-900">Diagnostico Financiero Local</h1>
        <p className="mb-8 text-slate-600">
          Aplicación local-first para gestión financiera personal.
        </p>

        <div className="rounded-lg bg-white p-6 shadow">
          <h2 className="mb-4 text-xl font-semibold text-slate-800">Nueva transacción</h2>
          {/* Seed estático de las 14 categorías; Slice 4 reemplaza por el store real. */}
          <TransaccionForm categorias={CATEGORIAS_SEED} onSubmit={handleSubmit} />
        </div>

        <p className="mt-4 text-center text-sm text-slate-400">
          Épica 1 + Slice 2 + Slice 3 · Demo end-to-end del formulario
        </p>
      </section>
    </main>
  )
}

export default App
