import http from 'k6/http'
import { check } from 'k6'

// Smoke test: verifica que los endpoints críticos responden antes de una carga real.
//   k6 run -e TARGET=http://localhost:4000 scripts/k6/smoke.js

const TARGET = __ENV.TARGET || 'http://localhost:4000'

export const options = {
  vus: 3,
  iterations: 20,
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<3000'],
  },
}

export default function () {
  const health = http.get(`${TARGET}/api/health`)
  check(health, { 'health 200': (r) => r.status === 200 })

  // Sin token debe devolver 401 (no 5xx): valida el middleware de auth.
  const unauth = http.get(`${TARGET}/api/chat/conversations`)
  check(unauth, { 'auth 401': (r) => r.status === 401 })
}
