# oracle — Oracle Connector (universal API and JSON interpreter)

Gives the agent the ability to query **any public API** (or a large
JSON dump) and receive **clean and summarized** data, ready to make decisions —
without drowning in the raw response.

Includes:
- **Anti-SSRF**: blocks localhost, private IPs, and cloud metadata BEFORE
  calling. Essential for an endpoint that accepts arbitrary URLs.
- **Schema inspection**: describes what is inside a JSON without dumping it all.
- **Path extraction** via simple JSONPath: `data.items[].name`.
- **Agent summary**: compact text that fits in the model's context.
- **Ready connectors without API key**: GitHub (repos/users) and crypto (CoinGecko).

## Endpoints
- `POST /api/oracle/query  { url?, method?, headers?, body?, path?, connector?, arg? }`
- `POST /api/oracle/inspect { json, path? }`

Examples:
```json
{ "connector": "github", "arg": "vercel/next.js" }
{ "connector": "crypto", "arg": "bitcoin,ethereum" }
{ "url": "https://api.coindesk.com/v1/bpi/currentprice.json", "path": "bpi.USD.rate" }
```

## Registration in index.ts
```ts
import oracleRoutes from './features/oracle/route'
app.use('/api/oracle', oracleRoutes)
```

## Integration with the agent (recommended)
Add a tool in `features/agent/tools.ts` so the model can invoke it:
```ts
import { ask } from '../oracle/oracleConnector'

const oracleTool: AgentTool = {
  name: 'query_api',
  description: 'Queries a public API or a connector (github, crypto) and returns summarized data. Use it for live external data.',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'API URL (optional if using connector).' },
      path: { type: 'string', description: 'Extraction path, e.g. "data.items[].name".' },
      connector: { type: 'string', enum: ['github', 'crypto'] },
      arg: { type: 'string', description: 'Connector argument, e.g. "vercel/next.js".' },
    },
  },
  run: async (args) => ask(args).catch((e: any) => `Error: ${e?.message || e}`),
}
// …and add it to your agent's `tools` array.
```
This gives the agent "hands" to read live world data, safely.
