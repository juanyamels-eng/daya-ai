// ============================================
// DAYA IA — tools: tipos compartidos
// --------------------------------------------------------------------------
// Una DayaTool agrupa, en un solo archivo, TODO lo que el modelo necesita
// (schema para function-calling) y lo que el runtime necesita para ejecutarla
// (run). El registro central (registry.ts) las unifica para el agente, el
// chat y el orquestador `act`.
// ============================================

import { ActTool } from '../../actions/act'

export interface ToolParameters {
  type: 'object'
  properties: Record<string, any>
  required?: string[]
  [key: string]: any
}

// Metadatos para el catálogo público de la comunidad (/api/tools/catalog).
export interface ToolMeta {
  // Autor: 'daya' = núcleo, 'daya-auto' = creada por la auto-mejora, 'comunidad' = PR de la comunidad.
  author?: 'daya' | 'daya-auto' | 'comunidad'
  // Categoría del catálogo (web, imagen, documentos, productividad, voz, automatizacion, utilidades…).
  tag?: string
  // Emoji/ícono para mostrar en la UI.
  emoji?: string
  // Solo disponible en planes de pago.
  pro?: boolean
}

export interface DayaTool {
  name: string
  description: string
  parameters: ToolParameters
  quotaKey?: string
  safeForAct?: boolean
  meta?: ToolMeta
  run: (userId: string, args: any) => Promise<string> | string
}

// Schema en formato function-calling (OpenAI/OpenRouter) — compatible con ChatCompletionTool.
export interface ToolSchema {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: ToolParameters
  }
}

// Schema en formato function-calling (OpenAI/OpenRouter).
export function toFunctionSchema(tool: DayaTool): ToolSchema {
  return {
    type: 'function',
    function: { name: tool.name, description: tool.description, parameters: tool.parameters },
  }
}

// Adaptador a ActTool para reutilizar las herramientas en `act`.
export function toActTool(tool: DayaTool): ActTool {
  return {
    name: tool.name,
    description: tool.description,
    run: (args) => tool.run('__act__', args),
  }
}
