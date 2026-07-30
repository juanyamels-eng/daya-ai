# insights — Usage and cost observability

Provides transparency about WHICH model was used, HOW MANY tokens, and HOW MUCH it
cost (estimated). Almost no consumer AI shows this: it builds trust with the
user ("I used a cheap model, you saved") and helps YOU see where the
spending goes.

## Usage
Call `trackUsage` after each LLM response (non-blocking):
```ts
import { trackUsage, friendlyCostNote } from './features/insights/usageTracker'
const cost = await trackUsage({ userId, model: 'anthropic/claude-sonnet-4.6',
  inputText: prompt, outputText: response, feature: 'chat' })
// optional: show friendlyCostNote(model, cost) to the user
```

## Endpoints
- `GET /api/insights/usage?days=30` → totals, by model, by feature, and daily series.
- `POST /api/insights/track` → manual recording.

## Notes
- Prices in `PRICES` are ESTIMATES per 1M tokens (adjust them when they change).
  They serve for magnitude and trend, not for exact billing.
- No migrations: aggregates by day in DayaSystemConfig.

## Registration in index.ts
```ts
import insightsRoutes from './features/insights/route'
app.use('/api/insights', insightsRoutes)
```
