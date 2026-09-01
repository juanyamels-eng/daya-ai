import http from 'k6/http'
import { Rate } from 'k6/metrics'

// Spike test del candado anti-bots (chatBurstLimiter): ráfaga corta por VU
// para verificar que el 429 se dispara sin tumbar el servicio.
//   k6 run -e TARGET=http://localhost:4000 -e TOKEN=dy_... scripts/k6/spike.js

const TARGET = __ENV.TARGET || 'http://localhost:4000'
const TOKEN = __ENV.TOKEN || ''

const rateLimited = new Rate('rate_limited')
const serverErrors = new Rate('server_errors')

export const options = {
  scenarios: {
    spike: {
      executor: 'constant-vus',
      vus: 50,
      duration: '30s',
    },
  },
  thresholds: {
    server_errors: ['rate<0.01'],
  },
}

export default function () {
  const headers = { 'Content-Type': 'application/json' }
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`

  const res = http.post(
    `${TARGET}/api/chat/send`,
    JSON.stringify({ message: 'ping', thinkLevel: 'low' }),
    { headers, timeout: '30s' }
  )

  if (res.status === 429) rateLimited.add(1)
  if (res.status >= 500) serverErrors.add(1)
}
