# Design System & Visual Identity

## Vibe & Persona
**Professional yet Personal.** The UI must strike a balance between a serious financial tool (high trust, precise data) and a personal utility (easy to navigate, modern aesthetics). It should not feel like a sterile banking app, nor a toy app.

## Theming & Colors
- **Default Theme:** Dark Mode (preferred), with full support for Light Mode toggle.
- **Primary Accent:** Salmon (`#f05454`). Used for primary actions, active tabs, and key data highlights.
- **Backgrounds (Dark Mode):** Deep charcoal or off-black (e.g., Tailwind's `zinc-900` or `slate-950`) to avoid harsh pure blacks, creating depth for panels.
- **Contrast Colors (To complement #f05454):** 
  - *Secondary/Muted:* Cool grays (`slate-400` / `zinc-400`) to balance the warmth of the salmon.
  - *Success:* A distinct but subdued emerald green (for positive cashflow/income).
  - *Warning/Danger:* Amber or a darker crimson (careful not to clash with the primary salmon).

## Layout & Information Architecture
- **High Data Density:** The application requires a lot of data on screen (tables, charts, matrices).
- **Anti-Scroll Rule:** The layout must favor side-panels, tabs, and collapsible sections over infinite vertical scrolling. The core dashboard should fit entirely within a standard 1080p desktop viewport.
- **Hierarchy:** 
  1. Top/Header: Global controls (Theme toggle, Profile selector).
  2. Main Stage: High-density data components (Simulador, Matriz).
  3. Sidebars/Cards: Quick summaries and KPI metrics.

## Typography
- **Typeface:** Clean, modern sans-serif (e.g., Inter or standard system fonts).
- **Tabular Data:** Use tabular-nums (`font-variant-numeric: tabular-nums`) for all financial figures so decimal points and digits align perfectly in columns.

## Components & Micro-interactions
- **Cards & Panels:** Use subtle borders (`border-white/10` in dark mode) instead of heavy shadows for separating high-density data blocks.
- **Transitions:** Snappy, instantaneous feedback. Avoid long animations (no `/impeccable overdrive`). Financial tools must feel instantaneous.
