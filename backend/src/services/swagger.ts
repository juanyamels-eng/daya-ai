// ============================================
// DAYA IA — OpenAPI/Swagger Documentation
// Auto-generates API docs from JSDoc annotations.
// ============================================
import swaggerJsdoc from 'swagger-jsdoc'
import swaggerUi from 'swagger-ui-express'
import { Express } from 'express'

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'DAYA AI API',
      version: '2.0.0',
      description: 'API del sistema agente DAYA IA — chat, herramientas, MCP, orquestador, graphrag, sandbox.',
      contact: { name: 'DAYA IA', url: 'https://daya.ai' },
      license: { name: 'MIT' },
    },
    servers: [
      { url: process.env.BACKEND_URL || 'http://localhost:4000', description: 'Backend' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token del usuario o API token (dy_...)',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: { error: { type: 'string' } },
        },
        ToolCall: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            arguments: { type: 'object' },
          },
        },
        OrchestratorStep: {
          type: 'object',
          properties: {
            tool: { type: 'string' },
            iteration: { type: 'number' },
            success: { type: 'boolean' },
            durationMs: { type: 'number' },
            output: { type: 'string' },
          },
        },
        WebhookConfig: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            url: { type: 'string', format: 'uri' },
            events: { type: 'array', items: { type: 'string' } },
            active: { type: 'boolean' },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: ['./src/**/*.ts'],
}

const swaggerSpec = swaggerJsdoc(options)

export function setupSwagger(app: Express): void {
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'DAYA AI — API Docs',
  }))

  // Raw JSON spec
  app.get('/api/docs.json', (_req, res) => {
    res.setHeader('Content-Type', 'application/json')
    res.send(swaggerSpec)
  })
}
