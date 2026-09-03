// Shared tab navigation types for the V3 Dashboard.
//
// Extracted from App.tsx so that Sidebar and other components can import
// the TabActiva union without creating a circular dependency.
// App.tsx will continue to use this type in Phase 3 (Task 3.1).

export type TabActiva =
  | 'transacciones'
  | 'presupuesto'
  | 'simulador'
  | 'presupuesto-mejorado'
  | 'resultados'
