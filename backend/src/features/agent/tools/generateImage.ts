import { DayaTool } from './types'

export const generateImage: DayaTool = {
  name: 'generar_imagen',
  description: 'Genera una imagen a partir de una descripción y devuelve su URL. Úsalo cuando el usuario pida crear/dibujar/generar una imagen. DEBES incluir la imagen en tu respuesta final en markdown: ![descripción](url).',
  parameters: {
    type: 'object',
    properties: { descripcion: { type: 'string', description: 'Descripción visual detallada, mejor en inglés para más calidad' } },
    required: ['descripcion'],
  },
  run(_userId, args) {
    const p = String(args?.descripcion || '').trim()
    if (!p) return 'Falta la descripción de la imagen.'
    const seed = Math.floor(Math.random() * 1_000_000)
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(p)}?width=1024&height=1024&seed=${seed}&nologo=true&model=flux`
    return `Imagen generada. Inclúyela EN TU RESPUESTA en markdown así: ![${p.slice(0, 60)}](${url})`
  },
}
