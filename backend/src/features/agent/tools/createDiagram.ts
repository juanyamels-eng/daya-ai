import { DayaTool } from './types'
import getClient, { MODELS } from '../../../services/openrouter'

const DIAGRAM_TYPES = ['flowchart', 'sequenceDiagram', 'classDiagram', 'gantt', 'pie', 'mindmap', 'timeline', 'stateDiagram-v2']

export const createDiagram: DayaTool = {
  name: 'crear_diagrama',
  description: 'Genera un diagrama Mermaid (flowchart, secuencia, arquitectura, gantt, mente, timeline, clases…) a partir de una descripción en lenguaje natural. Devuelve el código mermaid que TÚ debes incluir en tu respuesta final DENTRO de un bloque de código ```mermaid ... ```.',
  parameters: {
    type: 'object',
    properties: {
      descripcion: { type: 'string', description: 'Qué representa el diagrama, p. ej. "flujo de registro de usuarios con verificación de email"' },
      tipo: { type: 'string', enum: DIAGRAM_TYPES, description: 'Tipo de diagrama (opcional, DAYA elige si no se indica)' },
    },
    required: ['descripcion'],
  },
  safeForAct: true,
  async run(_userId, args) {
    const descripcion = String(args?.descripcion || '').trim()
    if (!descripcion) return 'Falta la descripción del diagrama.'
    const tipo = DIAGRAM_TYPES.includes(args?.tipo) ? args.tipo : 'flowchart'

    const res = await getClient().chat.completions.create({
      model: MODELS.flash,
      messages: [
        { role: 'system', content: `Generas diagramas Mermaid en español. Usas SIEMPRE el tipo "${tipo}". Validación de sintaxis: cada nodo termina en punto y coma, el texto va entre comillas dobles, sin paréntesis desbalanceados. Respondes SOLO con el código mermaid, sin markdown ni explicaciones.` },
        { role: 'user', content: descripcion },
      ],
      max_tokens: 700,
    })
    let mermaid = (res.choices?.[0]?.message?.content || '').trim()
    if (!mermaid) return 'No pude generar el diagrama.'
    // Limpia cercos markdown por si el modelo los añadió a pesar de la orden.
    mermaid = mermaid.replace(/^```(?:mermaid)?\s*/i, '').replace(/```\s*$/, '').trim()
    return `Diagrama mermaid generado (inclúyelo EN TU RESPUESTA en un bloque \`\`\`mermaid ... \`\`\`):\n\`\`\`mermaid\n${mermaid}\n\`\`\``
  },
}
