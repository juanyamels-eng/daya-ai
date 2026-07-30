# blocks — Document by blocks

A **canonical content format** for DAYA: instead of dirty HTML or loose
markdown, content is an array of structured blocks `{ type, data }`.
Clean, portable, sanitizable, and easy to process by AI — the core idea of
Editor.js, rewritten as own TypeScript code (backend, without a visual editor).

## Why this and not another editor
Your visual editor already exists (StudioEditor). What was missing is a **lingua franca
of content** that all your features can speak: today the chat emits text,
`research2` markdown, `audiointel` a transcript, `career` a CV — and they don't understand each other.
With blocks, all of them can emit the same format and a single converter turns it into
markdown (chat), HTML (display/export) or plain text (index in RAG).

## Block types
`header, paragraph, list, checklist, quote, code, table, delimiter, image, callout`.
Quick constructors via `B.*` (e.g. `B.header('Title', 2)`, `B.list([...])`).

## Converters (tested, round-trip)
- `markdownToBlocks(md)` → block document (detects headings, lists,
  checklists, quotes, code, tables, delimiters).
- `blocksToMarkdown(doc)` → markdown.
- `blocksToHtml(doc)` → HTML with **safe escaping** + inline (bold/italic/
  code/links).
- `documentToPlainText(doc)` → plain text for indexing in RAG.

## Endpoints (all JSON)
- `POST /api/blocks/from-markdown { markdown }`
- `POST /api/blocks/to-markdown   { document }`
- `POST /api/blocks/to-html       { document }`
- `POST /api/blocks/to-text       { document }`
- `POST /api/blocks/validate      { document }` → validates and sanitizes

## How it connects your features
- **research2 / audiointel**: already produce markdown → `markdownToBlocks` to
  save them as an editable and uniform document.
- **chat**: answers to blocks → consistent rendering with the rest.
- **docrag**: `documentToPlainText` provides clean text for indexing.
- **StudioEditor** (future): can read/write this format when you want
  to unify editing.

## Security
`blocksToHtml` escapes all content before applying inline formatting, so
there is no HTML injection. `sanitizeDocument` discards invalid blocks and trims
lengths; it never throws.

## Registration in index.ts
```ts
import blocksRoutes from './features/blocks/route'
app.use('/api/blocks', blocksRoutes)
```

## License
Conceptual inspiration from **Editor.js** (Apache-2.0). New code in TypeScript:
neither its editor nor its plugins were copied. Remains under DAYA's license.
