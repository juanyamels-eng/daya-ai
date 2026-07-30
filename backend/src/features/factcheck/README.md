# factcheck — Claim verification (anti-hallucination)

Takes a response (from DAYA or any text) and verifies its CLAIMS
against web search. Marks each as supported / refuted / inconclusive,
with sources, and provides a global reliability score. Huge for trust —
almost no one offers this natively.

## Flow
1. Extracts verifiable claims (facts, not opinions).
2. Searches for evidence with `searchrank`.
3. An LLM judges whether the evidence supports/contradicts each claim.
4. Returns a verdict per claim + reliabilityScore (0..100).

## Endpoint
`POST /api/factcheck { text, maxClaims? }`
Response: `{ claims[], reliabilityScore, summary, checkedCount }`
Each claim: `{ claim, verdict, confidence, explanation, sources[] }`.

## Integration idea
Add an "is this true?" button in the chat UI that sends the last DAYA
response to this endpoint. Or use it inside a flow (`flow`) after generating.

## Registration in index.ts
```ts
import factcheckRoutes from './features/factcheck/route'
app.use('/api/factcheck', factcheckRoutes)
```
