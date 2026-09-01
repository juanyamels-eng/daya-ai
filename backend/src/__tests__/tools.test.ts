import { describe, it, expect } from 'vitest'
import { ALL_TOOLS, runTool, toActTools, TOOLS_SCHEMAS, getCatalog } from '../features/agent/tools'

describe('registro de herramientas del agente', () => {
  it('todos los nombres son únicos', () => {
    const names = ALL_TOOLS.map(t => t.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('cada tool tiene schema válido para function-calling', () => {
    for (const t of ALL_TOOLS) {
      expect(typeof t.description).toBe('string')
      expect(t.description.length).toBeGreaterThan(10)
      expect(t.parameters.type).toBe('object')
      expect(t.parameters.properties).toBeTruthy()
    }
    // El schema para el LLM incluye las mismas tools en el mismo orden.
    expect(TOOLS_SCHEMAS.length).toBe(ALL_TOOLS.length)
    expect(TOOLS_SCHEMAS[0].function.name).toBe(ALL_TOOLS[0].name)
  })

  it('las 10 herramientas originales siguen presentes', () => {
    const names = ALL_TOOLS.map(t => t.name)
    for (const n of ['buscar_web', 'leer_url', 'buscar_en_documentos', 'calcular', 'generar_imagen', 'ver_imagen', 'crear_tarea', 'crear_nota', 'crear_evento', 'crear_documento']) {
      expect(names).toContain(n)
    }
  })

  it('las nuevas herramientas están registradas', () => {
    const names = ALL_TOOLS.map(t => t.name)
    expect(names).toContain('extraer_texto_imagen')
    expect(names).toContain('resumir_video_youtube')
    expect(names).toContain('crear_diagrama')
    expect(names).toContain('hablar')
  })

  it('las herramientas de automatización están registradas', () => {
    const names = ALL_TOOLS.map(t => t.name)
    expect(names).toContain('crear_automatizacion')
    expect(names).toContain('gestionar_automatizaciones')
  })

  it('runTool responde ante herramientas desconocidas sin crashear', async () => {
    const out = await runTool('u1', 'no_existe', {})
    expect(out).toBe('Herramienta desconocida.')
  })

  it('calcular devuelve resultados exactos sin tocar el LLM', async () => {
    const out = await runTool('u1', 'calcular', { expresion: '2+2' })
    expect(out).toBe('2+2 = 4')
  }, 60000)

  it('calcular soporta las expresiones anunciadas (aritmética, %, stats, unidades)', async () => {
    // Interés compuesto: 1000*(1+0.05)^10 = 1628.8946...
    const interest = await runTool('u1', 'calcular', { expresion: '1000*(1+0.05)^10' })
    expect(interest).toBe('1000*(1+0.05)^10 = 1628.894626777442')

    // Estadística: mean/median/std siguen disponibles en mathjs 15
    const mean = await runTool('u1', 'calcular', { expresion: 'mean([3,7,8,5])' })
    expect(mean).toBe('mean([3,7,8,5]) = 5.75')
    const median = await runTool('u1', 'calcular', { expresion: 'median([3,7,8,5])' })
    expect(median).toBe('median([3,7,8,5]) = 6')

    // Conversión de unidades: "19 inch to cm" => Unit (se renderiza como objeto)
    const unit = await runTool('u1', 'calcular', { expresion: '19 inch to cm' })
    expect(unit).toContain('19 inch to cm = {')
    expect(unit).toContain('"unit":"cm"')
  }, 60000)

  it('toActTools solo incluye herramientas seguras y bien formadas', () => {
    const safe = ALL_TOOLS.filter(t => t.safeForAct)
    const actTools = toActTools()
    expect(actTools.length).toBe(safe.length)
    for (const a of actTools) {
      expect(typeof a.name).toBe('string')
      expect(typeof a.description).toBe('string')
      expect(typeof a.run).toBe('function')
    }
  })
})

describe('catálogo público de la comunidad', () => {
  it('getCatalog devuelve todas las herramientas con metadatos', () => {
    const catalog = getCatalog()
    expect(catalog.length).toBe(ALL_TOOLS.length)
    for (const t of catalog) {
      expect(t.name).toBeTruthy()
      expect(t.description).toBeTruthy()
      expect(t.meta.author).toBeTruthy()
      expect(t.meta.tag).toBeTruthy()
      expect(t.meta.emoji).toBeTruthy()
    }
  })

  it('las herramientas nuevas de la comunidad están etiquetadas', () => {
    const catalog = getCatalog()
    const byName = (n: string) => catalog.find(t => t.name === n)!
    expect(byName('extraer_texto_imagen').meta.author).toBe('comunidad')
    expect(byName('resumir_video_youtube').meta.author).toBe('comunidad')
    expect(byName('crear_diagrama').meta.author).toBe('comunidad')
    expect(byName('hablar').meta.author).toBe('comunidad')
  })

  it('las herramientas Pro están marcadas', () => {
    const catalog = getCatalog()
    const byName = (n: string) => catalog.find(t => t.name === n)!
    expect(byName('generar_imagen').meta.pro).toBe(true)
    expect(byName('crear_automatizacion').meta.pro).toBe(true)
    expect(byName('buscar_web').meta.pro).toBeFalsy()
  })
})
