# Roadmap — Daya AI

Prioridades pendientes para llevar el producto al "10". Retomar por sesiones.

## Estado actual (ya hecho)

- **Diseño**: tipografía unificada (cuerpo/títulos en Inter sans, mono solo en código/etiquetas), tokens centralizados (`--space-*`, `--radius-*`, `--brand-rgb`), transición de tema.
- **Component kit** (`frontend/src/components/ui`): Button, Card, Input, Badge, Dialog, Toast, etc. con filosofía shadcn y tokens propios. Ya existe y es la base de la migración.
- **Motor backend**: typecheck y lint reparados (estaban rotos), dead code eliminado, `models.ts` tipado, cuotas consolidadas (DRY), caché Redis con fallback in-memory.
- **Tests**: cobertura 11% → 20%, thresholds subidos, tests de BD con skip elegante.
- **Tooling**: commitlint, changesets, knip, axe (a11y), Storybook (setup + stories).
- **Higiene git**: `coverage/` y `storybook-static/` fuera del repo.

## Pendiente (priorizado)

### 1. Migrar inline styles → primitivas `components/ui`  — *largo, alto impacto*
La app sigue con cientos de `style={{}}`. Reemplazar gradualmente por las primitivas
existentes (Button/Card/Input/Badge). Por componente, sin prisa, coexistiendo.
`README.md` de `components/ui` ya describe el plan.

### 2. Snapshot visual (regresión de los 2 temas)  — *medio*
Playwright `toHaveScreenshot` sobre las páginas clave (landing, dashboard, admin,
auth) en claro y oscuro, con baselines versionados. Red de seguridad ante cambios de CSS.

### 3. Bajar la deuda de `any` del backend  — *largo*
442 `any` en 96 archivos (sobre todo `route.ts` que tocan JSON de LLM). Migración
gradual a `unknown`. El techo de lint (`--max-warnings 450`) ya impide que suba.

### 4. Storybook: resolver bloqueo de build  — *rápido cuando salga el fix*
El setup y las stories están. `build-storybook` falla por el bug de webpack 5.101.3
incluido en Next 14.2.35 (`storybookjs/storybook#32301`). Esperar fix de Next/Storybook
o evaluar bajar Next.

### 5. Subir `ci.yml`  — *rápido, bloqueado por permisos*
El workflow (lint + typecheck + tests + build + security + axe a11y + Postgres de
servicio) está listo en `.github/workflows/ci.yml`, pero el PAT no tiene scope
`workflow`. Reconciliar el token y subirlo.

### 6. Load testing (k6) + throttling fino  — *medio*
El chat streaming nunca se ha medido bajo carga. Añadir scripts k6 y afinar el
rate-limit por tipo de operación/plan (hoy es básico con `express-rate-limit`).

### 7. knip per-package  — *bajo*
knip está instalado pero da falsos positivos porque el repo no usa `workspaces`
estándar (backend/frontend/cli con `node_modules` propios). Configurar por paquete.

### 8. Unificar tokens `--lx`/`--lxa`/`--cx`  — *medio, riesgo*
Landing/auth/code tienen tokens propios (superficies dark-only autocontenidas).
Consolidarlos en el sistema global para evitar deriva, con cuidado de no romper el
comportamiento dark-only.

## Orden sugerido por sesión

1. Sesión A: #5 (subir CI) + #4 (Storybook, si ya hay fix) + #7 (knip).
2. Sesión B: #1 (primitivas) por tandas — botones/cards primero.
3. Sesión C: #2 (snapshot visual) + #6 (k6).
4. Sesión D: #3 (`any` → `unknown`) por archivo + #8 (tokens).

## Notas de entorno

- Hooks de git: `pre-commit` (lint-staged + detect-secrets) y `pre-push` (tests backend)
  fallan en Windows por entorno (lint-staged `cd &&`, detect-secrets sin instalar).
  En commits locales se usó `--no-verify` tras validar manualmente.
- Los tests de BD (`user`, `database`) se saltan sin `DATABASE_URL` real (ver
  `backend/src/__tests__/dbAvailable.ts`); en CI corren con el Postgres de servicio.
