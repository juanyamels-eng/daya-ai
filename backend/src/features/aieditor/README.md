# aieditor — Inline autocomplete + slash commands (streaming)

**Complementary** to the existing `features/editor` (which already does assist/generate/
diagram/save/export). Here is what was missing for a Notion-like experience:

1. **Inline autocomplete ("ghost text")**: continues what the user types,
   in streaming, to be shown in gray and accepted with Tab. Uses a cheap model.

2. **Slash commands with streaming**: `/continue`, `/improve`, `/summarize`,
   `/lengthen`, `/shorten`, `/correct`, `/translate`, `/tone`, `/headings`,
   `/list`, `/table`, `/explain`.

Conceptual inspiration from open source editors (Novel, BlockNote); own
implementation on top of `chatStream`, without reusing their code.

## Endpoints
- `GET  /api/aieditor/commands` → list of commands for the "/" menu.
- `POST /api/aieditor/autocomplete  { before, after? }` (SSE) → continues the text.
- `POST /api/aieditor/command  { command, text, param? }` (SSE) → executes the command.

`param` is used in `translate` (target language) and `tone` (formal/casual/…).

## SSE format
Each message: `data: {"delta":"..."}`; on completion `data: {"done":true}` (and in
`/command` also `{"full": "<full text>"}`). On error: `data: {"error":"..."}`.

## Registration in index.ts
```ts
import aiEditorRoutes from './features/aieditor/route'
app.use('/api/aieditor', aiEditorRoutes)
```

## How to extend it
Add an entry to the `COMMANDS` object in `aiEditor.ts` (system + user) and another to
`listCommands()`. That is all.
