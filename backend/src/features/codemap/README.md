# codemap — Structural code context

Gives DAYA the ability to **understand code by its structure**, not by
blind chunks. Instead of showing loose lines around a match,
it shows the **function / class / file** that contains them, collapsing the rest
with `⋮`. This is what makes an assistant "understand" a large repo while spending
few tokens.

## What it includes
- **`treeContext.ts`** — the structural context algorithm (clean-room).
- **`parserLoader.ts`** — loads tree-sitter via WASM (`web-tree-sitter`), with
  graceful degradation if not installed.
- **`lineModel.ts`** — builds the line model from the AST or, if there is no
  parser, from a heuristic based on indentation/braces.
- **`codemap.ts`** — high-level service: structural grep, file
  skeleton, and structural chunking for RAG.

## Endpoints (all JSON)
- `GET  /api/codemap/status` → is tree-sitter active or fallback mode?
- `POST /api/codemap/grep      { files:[{path,content}], pattern, ignoreCase?, loiPad?, childContext? }`
- `POST /api/codemap/skeleton  { path, content }` → signatures + file outline
- `POST /api/codemap/chunks    { path, content, maxChunkLines? }` → chunks by unit

## Activate tree-sitter (optional, recommended)
Works WITHOUT installing anything (uses the heuristic). For full accuracy:
```bash
npm i web-tree-sitter
```
and place the `.wasm` grammar files in `./grammars/` (or define `GRAMMARS_DIR`):
`tree-sitter-typescript.wasm`, `tree-sitter-tsx.wasm`, `tree-sitter-python.wasm`, etc.
If missing, that language automatically falls back to heuristic mode.

## Registration in index.ts
```ts
import codemapRoutes from './features/codemap/route'
app.use('/api/codemap', codemapRoutes)
```

## Direct improvement to RAG (recommended)
Your `features/docrag/service.ts` chunks by characters (`chunkText`, 900 chars).
For CODE, replace that chunking with structural chunking:
```ts
import { structuralChunks } from '../codemap/codemap'
// in indexDocument, if the document is code:
const chunks = await structuralChunks(source, text)
// each chunk brings { title (the signature), text, startLine } → index chunk.text
```
Result: RAG retrieves complete functions/classes with their signature as title,
instead of arbitrary cuts in the middle of a function.

## Usage by the agent
Give the agent a `grep_code` tool that calls `grepStructural` on the
repo files: the model looks up a symbol and receives the exact structural
context, not entire files. Fits with the `github-doc-agent` and `oracle`.

## License
New TypeScript code. Remains under the license you choose for DAYA.
