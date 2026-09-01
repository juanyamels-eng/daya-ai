# DETALLE DE CAMBIOS: eliminación y reemplazo de emojis

Se realizaron cambios automáticos para hacer la documentación y las cadenas de la interfaz más formales y profesionales.

Archivos modificados:
- README.md: eliminados emojis en título, tabla de contenidos, secciones, capturas y pie.
- docs/DEPLOYMENT.md: eliminados emojis dentro de encabezados y texto.
- frontend/messages/es.json: reemplazo de la clave paymentSuccess para quitar el emoji.
- frontend/src/lib/i18n.ts: reemplazo de paymentSuccess en DICT para quitar emoji.

Notas:
- Cambios aplicados siguiendo la política acordada: docs→ elimina emojis; i18n→ reemplazo por puntuación neutra.
- Recomendado revisar otros idiomas (`en.json`, `de.json`, `fr.json`, `pt.json`, `it.json`) y actualizarlos de forma similar si se desea armonizar totalmente.

Este archivo se incluye en el branch feature/remove-emojis como log de la operación.
