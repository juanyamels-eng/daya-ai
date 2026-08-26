import { DayaTool } from './types'
import { prisma } from '../../../lib/prisma'

export const createDocument: DayaTool = {
  name: 'crear_documento',
  description: 'Maqueta y publica un documento REAL descargable (PDF o Word) con diseño profesional. TÚ escribes el contenido completo en markdown (## para secciones, listas, **negritas**) y lo pasas en contenido_markdown. Úsalo cuando pidan un informe, ensayo, carta o propuesta. Devuelve el enlace de descarga: INCLÚYELO en tu respuesta final como link markdown [título](url).',
  parameters: {
    type: 'object',
    properties: {
      titulo: { type: 'string' },
      contenido_markdown: { type: 'string', description: 'El contenido COMPLETO del documento en markdown, escrito por ti' },
      formato: { type: 'string', enum: ['pdf', 'word'] },
    },
    required: ['titulo', 'contenido_markdown'],
  },
  quotaKey: 'document',
  async run(userId, args) {
    // El AGENTE escribe el contenido (ya es un modelo excelente); esta herramienta
    // solo maqueta y publica. Así evitamos el generador interno (otra llamada LLM de
    // ~2 min) y el agente responde en segundos, no en minutos.
    const titulo = String(args?.titulo || '').trim().slice(0, 120)
    const md = String(args?.contenido_markdown || '').trim()
    if (!titulo || md.length < 80) return 'Faltan el título o el contenido (escribe el documento completo en markdown en contenido_markdown).'
    const formato = args?.formato === 'word' ? 'word' : 'pdf'
    // Misma cuota que el generador de documentos del chat (FREE 3/día, etc.).
    const { consumeQuota, refundQuota } = await import('../../../services/quota')
    const q = await consumeQuota(userId, 'document')
    if (!q.ok) return `No se pudo crear el documento: ${q.error}`
    try {
      const { saveToLibrary } = await import('../../../services/documents/documentService')
      const userPlan = await prisma.user.findUnique({ where: { id: userId }, select: { plan: true } })
      const branded = /free/i.test(userPlan?.plan || 'free')
      const slug = titulo.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 50) || 'documento'
      let content: Buffer
      let mime: string
      let fileName: string
      if (formato === 'word') {
        const { buildDOCX } = await import('../../../services/documents/docxGenerator')
        content = await buildDOCX(titulo, md, titulo, branded, 'ejecutivo')
        mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        fileName = `${slug}.docx`
      } else {
        const { buildProfessionalHTML } = await import('../../../services/documents/pdfGenerator')
        const { htmlToPDF } = await import('../../../services/documents/pdfRenderer')
        const html = buildProfessionalHTML(titulo, md, [], null, undefined, branded, 'ejecutivo')
        content = await htmlToPDF(html)
        mime = 'application/pdf'
        fileName = `${slug}.pdf`
      }
      const stored = `__B64__:${mime}:${content.toString('base64')}`
      const docId = await saveToLibrary(userId, fileName, formato, stored, content.length)
      const base = process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : `http://localhost:${process.env.PORT || 4000}`
      return `✓ Documento ${formato.toUpperCase()} creado: "${titulo}". Enlace de descarga (inclúyelo en tu respuesta como link markdown): ${base}/api/documents/download/${docId}`
    } catch (e: any) {
      await refundQuota(userId, 'document').catch(() => {})
      return `Falló la creación del documento: ${e?.message || e}`
    }
  },
}
