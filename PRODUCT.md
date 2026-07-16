# Product

## Register

product

## Users

Equipos de negocio que suben datasets CSV o Excel y necesitan convertirlos rapidamente en dashboards editables, presentaciones y vistas compartibles.

## Product Purpose

DashPilot analiza datasets reales, genera un DashboardSpec y permite revisar, ajustar, guardar y compartir dashboards sin depender de una configuracion tecnica manual.

## Brand Personality

Claro, ejecutivo, confiable.

## Anti-references

No debe sentirse como una landing decorativa, una plantilla generica de BI, ni una interfaz que inventa datos o columnas que no existen.

## Design Principles

- El DashboardSpec es la fuente de verdad.
- La UI debe servir al flujo de analisis, no reemplazarlo.
- Las acciones de edicion deben ser reversibles antes de guardar.
- Los controles deben usar columnas y opciones existentes del dataset.
- La persistencia debe funcionar local-first y mejorar con Supabase cuando este disponible.
- Cada CTA visible debe ejecutar una capacidad real, parcial claramente rotulada o quedar deshabilitado como futuro.
- El analisis deterministico, la asistencia con proveedor IA y el contenido generado deben diferenciarse en la UI.
- No se simulan exportaciones, seguridad, guardado ni progreso: los estados exitosos requieren un resultado verificable.

## Capability Policy

- Capacidades reales del MVP: upload, preview virtualizado, generacion deterministica de DashboardSpec, exportacion CSV/JSON, presentaciones interactivas.
- Capacidades beta/parciales: persistencia Supabase/local sandbox, enlaces compartidos, Copilot con proveedor configurado.
- Capacidades futuras/deshabilitadas: PDF, PNG, PPTX, manifest interactivo y sharing con contrasena server-side.

## Accessibility & Inclusion

Mantener controles nativos accesibles, estados de foco visibles, labels explicitos y contraste suficiente. Evitar depender solo del color para comunicar estados de edicion.
