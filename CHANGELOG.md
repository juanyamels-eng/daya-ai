# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- ESLint configuration for both backend and frontend (flat config format)
- Frontend shared TypeScript types (`src/types/api.ts`)
- Dockerfiles for backend and frontend (multi-stage builds)
- `.dockerignore` files for both apps
- Frontend tests: chatExport, modelLabel, cn, API types (38 tests)
- Backend tests: plans, sanitize, validateEnv (75 tests total)
- CI/CD pipeline with lint + build steps
- Sentry error tracking integration (backend + frontend)
- CSP and HSTS security headers via Helmet
- i18n validation script

### Changed
- Next.js config: enabled `output: 'standalone'` for Docker
- Backend error handler now reports to Sentry
- `.env.example` files updated with Sentry env vars

### Fixed
- `validateEnv.ts`: fixed no-unused-expression lint error
- `openaiapi/route.ts`: replaced `Function` type with proper signature
- `agents/page.tsx`: renamed `useTemplate` to `applyTemplate` (hooks rules)

## [1.0.0] - 2024-01-01

### Added
- Initial release
- Smart chat with streaming and automatic model selection
- 10+ automatic tools (search, documents, images, calculations)
- Selective memory with embeddings and RAG
- Image generation (Pollinations free + fal.ai premium)
- Export to PDF, Word, Excel, presentations
- Voice mode with Web Speech API
- Coding agent (Daya Code) for terminal
- Admin panel
- Multi-language support (es, en, pt, fr, de, it)
