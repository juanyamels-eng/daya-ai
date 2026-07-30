# career — Career assistant

Converts CVs and job postings into canonical data and makes them work together:
structure, compare, tailor, and write. Inspired by the **JSON Resume** standard
(and its job-schema), rewritten as own TypeScript types + AI.

## The underlying idea
JSON Resume teaches that if you represent a CV (and a job posting) as canonical
structured data, any tool can operate on them. The greatest value of that is
that **AI can compare CV ↔ job with reliability** and act: score the fit,
tailor the CV, and write the cover letter.

## Layers (each one works standalone)
1. **`schema.ts`** — canonical CV and job types + validation/normalization.
2. **`structure.ts`** — free text → canonical JSON (CV and job; the job
   also from a URL, using `oracle` with anti-SSRF).
3. **`match.ts`** — CV↔job fit (deterministic skill overlap +
   AI judgment), CV tailoring to the job, and cover letter.

## Endpoints (all JSON)
- `POST /api/career/structure-resume { text }` → structured CV.
- `POST /api/career/structure-job    { text | url }` → structured job posting.
- `POST /api/career/match            { resume, job }` → fit %, matched/missing items, recommendations.
- `POST /api/career/tailor           { resume, job }` → CV rewritten for that job (without inventing).
- `POST /api/career/cover-letter     { resume, job, tone? }` → targeted cover letter.
- `POST /api/career/full             { resumeText, jobText|jobUrl, tone? }` → full pipeline in one call.

## The match is honest and explainable
- **Deterministic** part: real skill overlap (what matches, what is missing).
- **AI** part: met/unmet requirements, strengths, gaps, advice.
- Final score = 40% skills + 60% AI judgment. CV tailoring **never invents**
  experience: only reorders, rephrases, and highlights.

## Fits with your features
- **docrag**: the user uploads their CV as PDF → you extract it → `structure-resume`.
- **oracle**: `structure-job` from a URL already downloads safely.
- **flow**: a workflow "structure CV → structure job → match → tailor → cover letter".
- **actions**: structuring can be cached by source type.

## Registration in index.ts
```ts
import careerRoutes from './features/career/route'
app.use('/api/career', careerRoutes)
```

## License
Conceptual inspiration from **JSON Resume** (MIT). Its schema.json was not copied:
the types are DAYA's own TypeScript. Remains under DAYA's license.
