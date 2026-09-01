import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate, Trend } from 'k6/metrics'

// Carga del chat (streaming). Mide latencia, tasa de error y throughput.
// Uso:
//   k6 run -e TARGET=http://localhost:4000 -e TOKEN=dy_... scripts/k6/chat.js
// Si no se pasa TOKEN, se mide el comportamiento 401 (útil para el rate-limit).

const TARGET = __ENV.TARGET || 'http://localhost:4000'
const TOKEN = __ENV.TOKEN || ''

const chatDuration = new Trend('chat_duration', true)
const chat429 = new Rate('chat_rate_limited')

export const options = {
  scenarios: {
    ramp: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '30s', target: 10 },
        { duration: '1m', target: 10 },
        { duration: '30s', target: 25 },
        { duration: '1m', target: 25 },
        { duration: '20s', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.02'],
    http_req_duration: ['p(95)<15000'],
  },
}

export default function () {
  const headers = { 'Content-Type': 'application/json' }
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`

  const payload = JSON.stringify({
    message: 'Resume esto en una frase corta para una prueba de carga: 2+2=4.',
    thinkLevel: 'low',
  })

  const res = http.post(`${TARGET}/api/chat/send`, payload, {
    headers,
    responseType: 'text',
    timeout: '90s',
  })

  chatDuration.add(res.timings.duration)
  if (res.status === 429) chat429.add(1)

  check(res, {
    'respuesta recibida': (r) => r.status === 200 || r.status === 401 || r.status === 429,
  })

  sleep(1)
}
