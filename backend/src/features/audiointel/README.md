# audiointel — Audio intelligence

Your `services/transcription.ts` already converts audio → text (Groq/OpenAI Whisper).
What was missing is what makes that transcription USEFUL: turning the wall of text
into **structured intelligence**.

## What it extracts from a transcription
- **Executive summary**
- **Chapters/topics** with approximate timestamps
- **Action items** (tasks) with assignee and deadline if mentioned
- **Decisions** made
- **Open questions**
- **Speakers** detected

It turns a voice note or a meeting recording into an **actionable minutes document**.

## Endpoints (all JSON)
- `POST /api/audiointel/analyze   { transcript, kind? }` → analyzes already-transcribed text
- `POST /api/audiointel/process   (multipart: audio, kind?)` → transcribes + analyzes
- `POST /api/audiointel/markdown  { insight, title? }` → minutes in markdown ready to save

`kind`: `meeting | note | interview | class | other` (helps the analysis).
Upload uses the same pattern as your `/transcribe` (multer in memory, max 25 MB).

## Why whisper.cpp was NOT reimplemented
whisper.cpp is a low-level C/C++ inference engine (SIMD, quantization,
GPU). It is not "clean-room in a few files" and, besides, DAYA already transcribes via API.
The valuable and portable part was the **comprehension layer** that was missing — that is this
module. Inspiration: whisper.cpp (MIT); own code in TypeScript.

## Bonus: private/self-hosted transcription (optional)
whisper.cpp ships a `server` binary with an `/inference` endpoint. If you deploy it
(privacy, zero cost per minute, offline), define:
```
WHISPER_CPP_URL=http://localhost:8080/inference
```
and `transcribeAndAnalyze` will use it automatically, with **fallback** to your current
API (Groq/OpenAI) if the server does not respond. Without the variable, everything continues
working with your usual provider.

## Integration with your features
- The result fits with `Note`/`Task`: the `actionItems` can be dumped as
  tasks, and the `insightToMarkdown` as a note.
- Combinable with `flow`: a workflow "record → transcribe → analyze → create tasks".

## Registration in index.ts
```ts
import audioIntelRoutes from './features/audiointel/route'
app.use('/api/audiointel', audioIntelRoutes)
```
