import { describe, it, expect } from 'vitest'
import { getMcpToolSchemas } from '../features/mcp/registry'
import { isPrivateHostUrl, parseSseResponse, connectMcpServer } from '../features/mcp/client'
import { MCP_PRESETS } from '../features/mcp/presets'

describe('MCP registry', () => {
  it('getMcpToolSchemas returns an array', () => {
    const schemas = getMcpToolSchemas()
    expect(Array.isArray(schemas)).toBe(true)
  })

  it('getMcpToolSchemas returns OpenAI-compatible schemas', () => {
    const schemas = getMcpToolSchemas()
    for (const s of schemas) {
      expect(s.type).toBe('function')
      expect(s.function).toBeTruthy()
      expect(typeof s.function.name).toBe('string')
      expect(typeof s.function.description).toBe('string')
      expect(s.function.parameters).toBeTruthy()
    }
  })
})

describe('SSRF guard (isPrivateHostUrl)', () => {
  it('acepta endpoints públicos https', () => {
    expect(isPrivateHostUrl('https://mcp.context7.com/mcp')).toBe(false)
    expect(isPrivateHostUrl('http://ejemplo.org/api')).toBe(false)
  })

  it('rechaza hosts privados y de metadata de la nube', () => {
    expect(isPrivateHostUrl('http://localhost:3000/mcp')).toBe(true)
    expect(isPrivateHostUrl('http://127.0.0.1:8080')).toBe(true)
    expect(isPrivateHostUrl('http://10.1.2.3/x')).toBe(true)
    expect(isPrivateHostUrl('http://192.168.0.5/x')).toBe(true)
    expect(isPrivateHostUrl('http://172.16.9.9/x')).toBe(true)
    expect(isPrivateHostUrl('http://172.31.255.1/x')).toBe(true)
    expect(isPrivateHostUrl('http://169.254.169.254/latest/meta-data')).toBe(true)
    expect(isPrivateHostUrl('[::1]:9000')).toBe(true)
    expect(isPrivateHostUrl('http://mi-servicio.local')).toBe(true)
    expect(isPrivateHostUrl('http://db.internal/x')).toBe(true)
  })

  it('rechaza protocolos no-HTTP y URLs inválidas', () => {
    expect(isPrivateHostUrl('ftp://algo.com/archivo')).toBe(true)
    expect(isPrivateHostUrl('file:///etc/passwd')).toBe(true)
    expect(isPrivateHostUrl('no-es-una-url')).toBe(true)
  })
})

describe('parseSseResponse (Streamable HTTP)', () => {
  it('encuentra la respuesta cuyo id coincide dentro del stream SSE', () => {
    const body = [
      'event: message',
      'data: {"jsonrpc":"2.0","id":"otro","result":{"x":1}}',
      '',
      'data: {"jsonrpc":"2.0","id":"42","result":{"tools":[{"name":"t1"}]}}',
    ].join('\n')
    expect(parseSseResponse(body, '42')).toEqual({ tools: [{ name: 't1' }] })
  })

  it('propaga el error JSON-RPC cuando el servidor responde con error', () => {
    const body = 'data: {"jsonrpc":"2.0","id":"7","error":{"code":-32000,"message":"boom"}}'
    expect(parseSseResponse(body, '7')?.error?.message).toBe('boom')
  })

  it('devuelve undefined si ningún payload matchea el id', () => {
    expect(parseSseResponse('data: {"jsonrpc":"2.0","id":"1","result":{}}', '99')).toBeUndefined()
  })
})

describe('connectMcpServer (validación de config)', () => {
  it('exige url o command en la config', async () => {
    await expect(connectMcpServer('roto', {})).rejects.toThrow(/url.*command|command.*url/i)
  })

  it('falla al conectar a un host inalcanzable sin colgar el proceso', async () => {
    // puerto cerrado en localhost → error rápido; NO es SSRF-bloqueado porque
    // la validación anti-SSRF vive en la ruta HTTP pública, no en connect.
    await expect(
      connectMcpServer('muerto', { url: 'http://127.0.0.1:9/mcp' })
    ).rejects.toThrow()
  }, 10_000)
})

describe('presets', () => {
  it('cada preset tiene los campos mínimos bien formados', () => {
    expect(MCP_PRESETS.length).toBeGreaterThanOrEqual(5)
    for (const p of MCP_PRESETS) {
      expect(p.id).toMatch(/^[a-z0-9-]+$/)
      expect(p.url.startsWith('https://')).toBe(true)
      expect(['none', 'api-key', 'oauth']).toContain(p.auth)
      expect(p.docsUrl.startsWith('http')).toBe(true)
    }
  })

  it('los ids de preset son únicos', () => {
    const ids = MCP_PRESETS.map(p => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
