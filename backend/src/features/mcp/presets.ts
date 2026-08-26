// ============================================
// DAYA IA — Catálogo de servidores MCP hospedados recomendados.
// Todos funcionan por Streamable HTTP (el transporte que soporta client.ts).
// `auth` indica qué tiene que configurar el usuario al dar de alta el server:
//   - 'none':    funciona sin credenciales
//   - 'api-key': pegar su key en headers (p.ej. { "x-api-key": "..." })
//   - 'oauth':   requiere conectar la cuenta (se configura desde el proveedor)
// Las URLs pueden cambiar; cada preset lleva su docsUrl para verificarlas.
// ============================================

export interface McpPreset {
  id: string
  name: string
  description: string
  category: 'conocimiento' | 'productividad' | 'automatización' | 'código' | 'investigación' | 'datos'
  url: string
  auth: 'none' | 'api-key' | 'oauth'
  authHint?: string
  docsUrl: string
}

export const MCP_PRESETS: McpPreset[] = [
  {
    id: 'deepwiki',
    name: 'DeepWiki',
    description: 'Documentación generada de cualquier repositorio público de GitHub. Pregúntale a DAYA sobre librerías y proyectos open source.',
    category: 'conocimiento',
    url: 'https://mcp.deepwiki.com/mcp',
    auth: 'none',
    docsUrl: 'https://deepwiki.com',
  },
  {
    id: 'context7',
    name: 'Context7',
    description: 'Documentación SIEMPRE actualizada de miles de librerías. Mejora radicalmente las respuestas de código.',
    category: 'conocimiento',
    url: 'https://mcp.context7.com/mcp',
    auth: 'none',
    authHint: 'Opcional: { "CONTEXT7_API_KEY": "<tu-key>" } para límites más altos',
    docsUrl: 'https://context7.com',
  },
  {
    id: 'notion',
    name: 'Notion',
    description: 'Busca, lee, crea y actualiza páginas y bases de datos de Notion del usuario.',
    category: 'productividad',
    url: 'https://mcp.notion.com/mcp',
    auth: 'oauth',
    docsUrl: 'https://developers.notion.com/docs/mcp-server',
  },
  {
    id: 'sentry',
    name: 'Sentry',
    description: 'Errores y trazas reales de tus proyectos Sentry. Complemento natural del auto-mejoramiento de DAYA.',
    category: 'código',
    url: 'https://mcp.sentry.dev/mcp',
    auth: 'oauth',
    docsUrl: 'https://docs.sentry.io/product/sentry-mcp/',
  },
  {
    id: 'linear',
    name: 'Linear',
    description: 'Issues, proyectos y ciclos de Linear: crear tareas, buscar, transicionar estados.',
    category: 'productividad',
    url: 'https://mcp.linear.app/mcp',
    auth: 'oauth',
    docsUrl: 'https://linear.app/docs/mcp',
  },
  {
    id: 'zapier',
    name: 'Zapier',
    description: '~8.000 apps vía tu conexión MCP personal de Zapier (Gmail, Sheets, HubSpot, Discord…).',
    category: 'automatización',
    url: 'https://mcp.zapier.com/api/mcp/mcp',
    auth: 'oauth',
    authHint: 'Genera tu URL con secret en mcp.zapier.com y pégala aquí',
    docsUrl: 'https://help.zapier.com/hc/en-us/articles/39974626573197',
  },
  {
    id: 'supabase',
    name: 'Supabase',
    description: 'Consulta y administra tu proyecto Supabase: esquema, SQL, logs y edge functions.',
    category: 'datos',
    url: 'https://mcp.supabase.com/mcp',
    auth: 'oauth',
    docsUrl: 'https://supabase.com/docs/guides/getting-started/mcp',
  },
  {
    id: 'exa',
    name: 'Exa',
    description: 'Búsqueda web semántica de alta calidad + crawling. Sube el nivel de research y deep research.',
    category: 'investigación',
    url: 'https://mcp.exa.ai/mcp',
    auth: 'api-key',
    authHint: '{ "x-api-key": "<tu-key-de-exa.ai>" } (opcional para uso básico)',
    docsUrl: 'https://docs.exa.ai/reference/mcp-server',
  },
]
