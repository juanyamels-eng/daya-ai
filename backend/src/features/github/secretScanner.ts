// ============================================
// DAYA IA — Escáner de secretos
// --------------------------------------------------------------------------
// Detecta credenciales expuestas en código ANTES de permitir un commit/push.
// Es la pieza de seguridad crítica de github-guardian: si encuentra algo, el
// push se BLOQUEA. Implementación propia, sin dependencias externas.
//
// Cubre los patrones de fuga más comunes (API keys de proveedores conocidos,
// claves privadas, tokens, contraseñas en asignaciones, .env volcados, etc.).
// No pretende ser exhaustivo como un escáner comercial, pero ataja los errores
// que de verdad ocurren a diario.
// ============================================

export interface SecretFinding {
  rule: string          // qué regla disparó
  file: string          // archivo afectado
  line: number          // número de línea (1-indexed)
  preview: string       // fragmento ofuscado (nunca el secreto completo en claro)
  severity: 'alta' | 'media'
}

interface Rule {
  name: string
  re: RegExp
  severity: 'alta' | 'media'
}

// Reglas. Las de "alta" bloquean siempre; las "media" son sospechas razonables.
const RULES: Rule[] = [
  { name: 'Clave privada (PEM)', severity: 'alta', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/ },
  { name: 'AWS Access Key ID', severity: 'alta', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'AWS Secret Access Key', severity: 'alta', re: /\baws_secret_access_key\s*[=:]\s*['"]?[A-Za-z0-9/+]{40}['"]?/i },
  { name: 'Google API Key', severity: 'alta', re: /\bAIza[0-9A-Za-z\-_]{35}\b/ },
  { name: 'OpenAI / OpenRouter key', severity: 'alta', re: /\bsk-[A-Za-z0-9\-]{20,}\b/ },
  { name: 'GitHub token', severity: 'alta', re: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/ },
  { name: 'Slack token', severity: 'alta', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: 'Stripe key', severity: 'alta', re: /\b(?:sk|rk)_live_[A-Za-z0-9]{20,}\b/ },
  { name: 'JWT (token de sesión)', severity: 'media', re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
  { name: 'Token tipo Bearer', severity: 'media', re: /\bBearer\s+[A-Za-z0-9\-._~+/]{20,}=*/ },
  { name: 'Contraseña en asignación', severity: 'media', re: /\b(?:password|passwd|pwd|contrase[nñ]a)\s*[=:]\s*['"][^'"\s]{6,}['"]/i },
  { name: 'Secreto/clave en asignación', severity: 'media', re: /\b(?:secret|api[_-]?key|token|access[_-]?key)\s*[=:]\s*['"][^'"\s]{12,}['"]/i },
  { name: 'URL con credenciales', severity: 'alta', re: /\b[a-z]+:\/\/[^/\s:@]+:[^/\s:@]+@[^/\s]+/i },
]

// Indicios de que una línea es un EJEMPLO/placeholder y no un secreto real.
// Así evitamos falsos positivos en .env.example, docs, tests, etc.
const PLACEHOLDER = /(PON-TU|YOUR_|EXAMPLE|PLACEHOLDER|XXXX|<.*>|\bchangeme\b|\bdummy\b|\bfake\b|\btest\b|\.\.\.)/i

// Ofusca un secreto para mostrarlo en el reporte sin filtrarlo entero.
function obfuscate(line: string, matchStart: number, matchLen: number): string {
  const ctxStart = Math.max(0, matchStart - 12)
  const before = line.slice(ctxStart, matchStart)
  const secret = line.slice(matchStart, matchStart + matchLen)
  const masked = secret.length <= 8
    ? '*'.repeat(secret.length)
    : secret.slice(0, 3) + '*'.repeat(Math.min(secret.length - 6, 20)) + secret.slice(-3)
  return (before + masked).trim().slice(0, 80)
}

/**
 * Escanea texto (un archivo) buscando secretos. Devuelve los hallazgos.
 * `fileName` solo se usa para el reporte y para omitir ejemplos conocidos.
 */
export function scanText(text: string, fileName = ''): SecretFinding[] {
  const findings: SecretFinding[] = []
  // Archivos que son ejemplos por diseño: solo reportamos severidad "alta" real
  // (una clave privada en un .example sigue siendo un error grave).
  const isExampleFile = /\.(example|sample|tpl|template)$|\.env\.example$|(^|\/)(README|CHANGELOG)/i.test(fileName)

  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.length > 4000) continue // líneas minificadas gigantes: se omiten
    for (const rule of RULES) {
      rule.re.lastIndex = 0
      const m = rule.re.exec(line)
      if (!m) continue
      // Filtra placeholders salvo que sea una clave privada real.
      if (PLACEHOLDER.test(line) && rule.name !== 'Clave privada (PEM)') continue
      if (isExampleFile && rule.severity !== 'alta') continue
      findings.push({
        rule: rule.name,
        file: fileName || '(texto)',
        line: i + 1,
        preview: obfuscate(line, m.index, m[0].length),
        severity: rule.severity,
      })
    }
  }
  return findings
}

/** Escanea varios archivos. Entrada: [{ path, content }]. */
export function scanFiles(files: { path: string; content: string }[]): SecretFinding[] {
  const all: SecretFinding[] = []
  for (const f of files) {
    // No escanear binarios ni lockfiles ni node_modules
    if (/node_modules\/|\.(png|jpe?g|gif|webp|ico|pdf|zip|lock)$|package-lock\.json$/i.test(f.path)) continue
    all.push(...scanText(f.content, f.path))
  }
  return all
}

/** ¿Hay algo que deba BLOQUEAR el push? (cualquier hallazgo de severidad alta) */
export function shouldBlock(findings: SecretFinding[]): boolean {
  return findings.some(f => f.severity === 'alta')
}
