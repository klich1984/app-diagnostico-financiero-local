# Design System & Visual Identity (Sistema de Diseño e Identidad Visual)

## Estilo y Persona (Vibe & Persona)
**Profesional pero Personal.** La interfaz de usuario (UI) debe encontrar el equilibrio entre una herramienta financiera seria (alta confianza, datos precisos) y una utilidad personal (fácil de navegar, estética moderna). No debe sentirse como una aplicación bancaria estéril, ni tampoco como una app de juguete.

## Temas y Colores (Theming & Colors)
- **Tema por defecto:** Modo Oscuro (preferido), con soporte completo para un "toggle" a Modo Claro.
- **Acento Principal:** Salmón (`#f05454`). Se utiliza para acciones primarias, pestañas activas y para resaltar datos clave.
- **Fondos (Modo Oscuro):** Gris carbón profundo o casi negro (ej. `zinc-900` o `slate-950` de Tailwind) para evitar negros puros y duros, creando profundidad para los paneles.
- **Colores de Contraste (Para complementar al #f05454):** 
  - *Secundario/Muteado:* Grises fríos (`slate-400` / `zinc-400`) para equilibrar la calidez del salmón.
  - *Éxito:* Un verde esmeralda distintivo pero tenue (para flujo de caja positivo/ingresos).
  - *Advertencia/Peligro:* Ámbar o un carmesí oscuro (teniendo cuidado de no chocar visualmente con el salmón principal).

## Diseño y Arquitectura de la Información (Layout & IA)
- **Alta Densidad de Datos:** La aplicación requiere mostrar muchos datos en pantalla (tablas, gráficos, matrices).
- **Regla Anti-Scroll:** El layout debe favorecer los paneles laterales (sidebars), pestañas y secciones colapsables por sobre el scroll vertical infinito. El dashboard principal debe encajar completamente dentro de un viewport estándar de escritorio (1080p).
- **Jerarquía:**
  1. Top/Header (Cabecera): Controles globales (Cambio de tema, Selector de perfil).
  2. Main Stage (Escenario Principal): Componentes de datos de alta densidad (Simulador, Matriz).
  3. Sidebars/Cards (Paneles/Tarjetas): Resúmenes rápidos y métricas KPI.

## Tipografía (Typography)
- **Familia Tipográfica:** Utilizar **'Raleway'** como fuente principal para darle un toque moderno y personal.
- **Datos Tabulares (Tabular Data):** Usar números tabulares (`font-variant-numeric: tabular-nums`) para todas las cifras financieras, de modo que los puntos decimales y los dígitos queden perfectamente alineados en las columnas.

## Componentes y Microinteracciones (Components & Micro-interactions)
- **Tarjetas y Paneles:** Utilizar bordes sutiles (`border-white/10` en modo oscuro) en lugar de sombras pesadas para separar los bloques de datos de alta densidad.
- **Transiciones:** Respuesta ágil e instantánea. Evitar animaciones largas (sin efectos exagerados). Las herramientas financieras deben sentirse instantáneas.
