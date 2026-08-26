import { describe, it, expect, vi, beforeAll } from 'vitest'

// Fuerza modo OpenRouter (no local) ANTES de importar el módulo
// vi.hoisted se ejecuta antes de cualquier import estático
const ENV_SETUP = vi.hoisted(() => {
  process.env.OPENROUTER_API_KEY = 'sk-test-for-tests'
  delete process.env.LOCAL_LLM_MODEL
  return {}
})

import {
  detectTaskType,
  detectComplexity,
  selectBestModel,
  isExpert,
  getTaskInfo,
  selectChain,
} from '../services/modelSelector'

// ============================================
// ModelSelector — enrutado de modelos (Fase 2)
// Este módulo decide QUÉ modelo contesta cada mensaje. Si se rompe,
// los usuarios reciben el modelo equivocado (caro o incapaz).
// ============================================

describe('detectTaskType (clasificación por regex)', () => {
  it('detecta código', () => {
    expect(detectTaskType('arregla este bug de javascript')).toBe('code')
    expect(detectTaskType('escribe una función en python')).toBe('code')
    expect(detectTaskType('dame el sql para esta query')).toBe('code')
  })

  it('detecta matemáticas', () => {
    expect(detectTaskType('calcula 25 * 4')).toBe('math')
    expect(detectTaskType('resuelve esta ecuación')).toBe('math')
    expect(detectTaskType('cuál es el porcentaje de 30 de 150')).toBe('math')
  })

  it('detecta generación de documentos', () => {
    expect(detectTaskType('genera un informe de ventas')).toBe('document')
    expect(detectTaskType('hazme una presentación de powerpoint')).toBe('document')
    expect(detectTaskType('elabora un plan de negocio')).toBe('document')
  })

  it('detecta escritura creativa', () => {
    expect(detectTaskType('escribe un cuento de fantasía')).toBe('creative')
    expect(detectTaskType('crea una canción')).toBe('creative')
  })

  it('detecta razonamiento profundo', () => {
    expect(detectTaskType('analiza en detalle esta estrategia')).toBe('reasoning')
    expect(detectTaskType('explica a fondo por qué ocurre')).toBe('reasoning')
  })

  it('detecta preguntas rápidas (fast regex antes que code)', () => {
    expect(detectTaskType('qué es el capitalismo')).toBe('fast')
    expect(detectTaskType('cuál es la capital de Perú')).toBe('fast')
    expect(detectTaskType('traduce hola al inglés')).toBe('fast')
  })

  it('conversación general por defecto', () => {
    expect(detectTaskType('mira esto y dime qué opinas')).toBe('chat')
    expect(detectTaskType('cómo estás hoy')).toBe('chat')
  })

  it('api no dispara code falso (capitalismo contiene api)', () => {
    expect(detectTaskType('qué es el capitalismo')).toBe('fast')
    expect(detectTaskType('capital de Perú')).toBe('fast')
    expect(detectTaskType('capitán América')).toBe('chat') // no code
  })
})

describe('detectComplexity', () => {
  it('saludos cortos son triviales', () => {
    expect(detectComplexity('hola')).toBe('trivial')
    expect(detectComplexity('gracias')).toBe('trivial')
    expect(detectComplexity('buenas')).toBe('trivial')
  })

  it('mensajes con >60 palabras son complex', () => {
    const longMsg = Array(65).fill('palabra').join(' ') // 65 palabras
    expect(detectComplexity(longMsg)).toBe('complex')
  })

  it('mensajes con señales de profundidad son complex', () => {
    expect(detectComplexity('analiza en detalle y compara exhaustivamente estas tres opciones')).toBe('complex')
    expect(detectComplexity('desarrolla un plan paso a paso con pros y contras')).toBe('complex')
  })

  it('mensajes normales son normal', () => {
    expect(detectComplexity('¿qué tiempo hace en Madrid?')).toBe('normal')
  })
})

describe('selectBestModel (enrutado por plan)', () => {
  it('adjunto usa modelo de visión (contiene vl)', () => {
    const model = selectBestModel('lee esta imagen', 'FREE', true)
    expect(model).toContain('vl')
  })

  it('trivial usa el modelo barato fijo (deepseek-v4-flash)', () => {
    const model = selectBestModel('hola', 'FREE')
    expect(model).toEqual('deepseek/deepseek-v4-flash')
  })

  it('FREE usa modelos de base (nunca élite ni r1 $2.15)', () => {
    const model = selectBestModel('explica a fondo la teoría de la relatividad', 'FREE')
    expect(model).not.toContain('claude-opus')
    expect(model).not.toContain('r1')
  })

  it('PRO complejo + experto escala a élite (claude-opus)', () => {
    // Requiere task='reasoning' (para que ELITE aplique) + complexity='complex' + isExpert=true
    const msg = 'analiza en detalle esta estrategia completa a nivel de producción con arquitectura escalable ' +
      Array(60).fill('palabra').join(' ') // >60 palabras + "analiza en detalle" = reasoning + complex + expert
    const model = selectBestModel(msg, 'PRO')
    expect(model).toContain('claude-opus')
  })

  it('devuelve siempre un ID válido de OpenRouter', () => {
    const model = selectBestModel('escribe un poema', 'FREE')
    expect(model).toMatch(/^[a-z0-9~._/-]+$/)
  })
})

describe('isExpert (disparo de modelo élite)', () => {
  it('mensajes cortos no son expert', () => {
    expect(isExpert('hola')).toBe(false)
    expect(isExpert('ayúdame con un problema')).toBe(false)
  })

  it('mensajes con >110 palabras son expert', () => {
    const longMsg = Array(115).fill('palabra').join(' ')
    expect(isExpert(longMsg)).toBe(true)
  })

  it('señales de nivel experto activan', () => {
    expect(isExpert('mejorar el rendimiento a nivel de producción')).toBe(true)
    expect(isExpert('rediseñar la arquitectura del sistema completo')).toBe(true)
  })
})

describe('getTaskInfo', () => {
  it('devuelve emoji y etiqueta para cada tarea', () => {
    expect(getTaskInfo('qué es un agujero negro')).toEqual({ task: 'fast', emoji: '⚡', label: 'Respuesta rápida' })
    expect(getTaskInfo('escribe una función')).toEqual({ task: 'code', emoji: '💻', label: 'Código' })
  })
})

describe('selectChain (cadena de 2 modelos — solo pago)', () => {
  it('FREE nunca recibe cadena', () => {
    expect(selectChain('analiza en detalle esta estrategia de negocio para maximizar el retorno', 'FREE')).toBeNull()
  })

  it('PRO con razonamiento complejo recibe reasoner → stylist', () => {
    // Requiere wordCount >= 30 + task=reasoning + complexity=complex
    const msg = 'analiza en detalle esta estrategia de negocio para maximizar el retorno ' +
      Array(30).fill('palabra').join(' ')
    const chain = selectChain(msg, 'PRO')
    expect(chain).not.toBeNull()
    expect(chain?.specialist).toContain('r1')
  })

  it('mensajes cortos no disparan cadena', () => {
    expect(selectChain('hola', 'PRO')).toBeNull()
  })
})