import { Request, Response } from 'express'
import { prisma } from '../lib/prisma'
import { chatStream, chatSingle, chatChainStream } from '../services/openrouter'
import { buildSystemPrompt } from '../services/memory'
import { selectBestModel, selectChain, classifyMessage } from '../services/modelSelector'
import { getCheapModel } from '../services/modelCatalog'

// Añade al system prompt instrucciones específicas para sacar el máximo de cada modelo.
// Cada modelo tiene fortalezas distintas — estas instrucciones las activan explícitamente.
function injectModelInstructions(basePrompt: string, modelId: string, taskType?: string): string {
  // CÓDIGO: guía fuerte y unificada para TODOS los modelos (qwen, GLM, Claude, etc.).
  // Va primero y retorna: así ningún modelo de código se queda sin instrucciones (antes
  // GLM 5.2, el de los planes de pago, caía al final sin guía alguna).
  if (taskType === 'code') {
    return basePrompt + `

<model_guidance>
Estás generando CÓDIGO. Tu objetivo es entregar código que la persona pueda usar y ejecutar de inmediato, al nivel de los mejores asistentes.

COMPLETO Y FUNCIONAL:
- Entrega el código COMPLETO que corra de principio a fin. NUNCA dejes huecos tipo "// completa tú el resto", "// implementación aquí" o funciones a medias.
- Incluye TODO lo necesario para ejecutar: imports, dependencias y, si aplica, cómo instalarlas (ej. el comando npm/pip) y cómo correrlo.
- Si faltara un dato no esencial, asume el valor por defecto más razonable y sigue — no te detengas a preguntar.

BIEN ESTRUCTURADO:
- Nombres claros y descriptivos; separa la lógica en funciones/componentes con una sola responsabilidad.
- Sigue las buenas prácticas e idioms del lenguaje/framework (manejo de errores donde importe, tipos si el lenguaje los usa).
- Comentarios SOLO donde aporten (el porqué de algo no obvio), no explicando lo evidente.

PRESENTACIÓN:
- Explica MUY POCO antes del código (1-2 frases máximo) y deja que el código sea el protagonista.
- Pon el código en bloques markdown con el lenguaje correcto (\`\`\`python, \`\`\`tsx, …). Si son varios archivos, un bloque por archivo con su ruta/nombre como encabezado.
- Tras el código, a lo sumo una nota brevísima de uso si de verdad hace falta.

CAMBIOS:
- Si la persona pide ajustes sobre código que ya diste, MODIFICA ese código existente y entrega la versión actualizada completa. No empieces de cero ni cambies cosas que no pidió.
</model_guidance>`
  }

  if (modelId.includes('deepseek-r1')) {
    return basePrompt + `

<model_guidance>
Antes de responder, razona internamente paso a paso (no lo muestres al usuario).
- Analiza el problema desde múltiples ángulos antes de comprometerte con una respuesta
- Verifica tu razonamiento: ¿hay suposiciones implícitas? ¿casos borde?
- Si es un problema con una respuesta correcta definida, calcúlala con precisión
- Si es subjetivo, distingue claramente lo que es hecho de lo que es opinión
Tu respuesta al usuario debe ser clara, directa y bien fundamentada.
</model_guidance>`
  }

  if (modelId.includes('o4-mini') || modelId.includes('o3-mini') || modelId.includes('gpt-5-mini')) {
    return basePrompt + `

<model_guidance>
Razona con rigor matemático y lógico:
- Descompón el problema en pasos verificables
- Muestra el trabajo cuando sea útil para el usuario (no solo el resultado final)
- Verifica unidades, dimensiones y orden de magnitud
- Si hay ambigüedad en la pregunta, resuélvela con la interpretación más razonable
</model_guidance>`
  }

  if (modelId.includes('claude')) {
    // Claude responde especialmente bien a instrucciones estructuradas con XML
    // y a que se le recuerde reflexionar antes de responder en tareas complejas.
    // (El caso 'code' se maneja arriba con la guía unificada de código.)
    const complexTasks = ['reasoning', 'document', 'creative']
    const isComplex = taskType && complexTasks.includes(taskType)
    if (isComplex) {
      return basePrompt + `

<model_guidance>
Para esta tarea, antes de escribir la respuesta:
1. Identifica exactamente qué necesita el usuario (no solo lo que dice literalmente)
2. Considera si hay matices o implicaciones importantes que no mencionó
3. Estructura la respuesta para que sea fácil de usar, no solo de leer
Sé exhaustivo donde importe y conciso donde no.
</model_guidance>`
    }
  }

  if (modelId.includes('gemini')) {
    return basePrompt + '\n\nResponde de forma directa y concisa. Usa listas solo cuando haya 3+ items claramente diferenciados.'
  }

  return basePrompt
}

// ── Herramientas automáticas ──────────────────────────────────────────────
// Antes esto era un interruptor: el "Modo Agente" obligaba al usuario a saber
// de antemano si su pregunta necesitaba herramientas. Pero si lo supiera, casi
// tendría la respuesta. Ahora lo decide Daya, que es lo que promete la portada.
//
// La puerta es una regex y no un modelo, a propósito: preguntarle a un modelo
// "¿hacen falta herramientas?" cuesta una llamada en CADA mensaje, incluido el
// "hola". Aquí solo pasan los mensajes que piden una ACCIÓN (apuntar algo,
// agendar, calcular exacto, mirar en tus documentos); lo demás sigue el camino
// de siempre, sin un céntimo de más.
//
// La web NO entra aquí: ya tiene su propia detección y su propia cuota más
// abajo, y meterla en los dos sitios haría que se buscara dos veces.
function needsTools(message: string): boolean {
  const m = message.toLowerCase().trim()
  // Acciones sobre la cuenta del usuario.
  if (/\b(recuérdame|recuerdame|apunta|anota|agenda|agéndame|agendame|añade a mi|agrega a mi|crea (una )?(tarea|nota|evento|recordatorio)|ponme (una )?(tarea|nota|recordatorio))\b/.test(m)) return true
  // Cálculo exacto: mejor con calculadora que de cabeza.
  if (/\b(calcula|cuánto es|cuanto es|resuelve|convierte)\b/.test(m) && /[\d]/.test(m)) return true
  // Sus propios documentos.
  if (/\b(en mis documentos|en mi biblioteca|el documento que subí|mis archivos|el pdf que subí)\b/.test(m)) return true
  return false
}

// ── Búsqueda web automática ───────────────────────────────────────────────
// Detecta si el mensaje requiere información actualizada de la web
// (noticias, precios, eventos recientes). No activa para respuestas de
// conocimiento general, código, escritura creativa ni explicaciones.
function needsWebSearch(message: string): boolean {
  const m = message.toLowerCase().trim()
  if (/^(escribe|crea|genera|redacta|arma|hazme|ayúdame a|resume|explica|define|calcula|resuelve|traduce|escríbeme)/i.test(message.trim())) return false
  if (/\b(código|programa|función|script|algoritmo|pseudocódigo)\b/i.test(m)) return false
  if (/\b(qué es|qué son|cómo funciona|cómo se hace|para qué sirve|en qué consiste)\b/i.test(m)) return false
  if (/\b(precio|cotización|dólar|euro|tipo de cambio|bolsa|acciones?)\b/i.test(m)) return true
  if (/\b(noticias?|últimas? (noticias?|hora|día|semana)|qué (pasó|ocurrió|hay de nuevo))\b/i.test(m)) return true
  if (/\b(ganó|perdió|murió|fue elegido|fue nombrado|lanzó|anunció|estrena)\b/i.test(m)) return true
  if (/\b(hoy|ayer|esta semana|este (mes|año)|2025|2026|recientemente|actualmente|ahora mismo|últimamente)\b/i.test(m) && message.trim().split(/\s+/).length > 4) return true
  if (/\b(estreno|lanzamiento|debut|nuevo álbum|nueva película|nueva serie|nuevo modelo)\b/i.test(m)) return true
  if (/\b(quién (es|fue|ganó)|cuándo (es|fue|sale)|dónde (es|fue|ocurrió))\b/i.test(m) && /\b(2025|2026|actual|nuevo|hoy)\b/i.test(m)) return true
  return false
}

function buildWebContext(results: { title: string; url: string; content: string }[]): string {
  if (!results.length) return ''
  const lines = results.slice(0, 5).map((r, i) => {
    const domain = (() => { try { return new URL(r.url).hostname.replace('www.', '') } catch { return r.url } })()
    const snippet = (r.content || '').trim().slice(0, 220)
    return `${i + 1}. **${r.title}** (${domain})\n   ${snippet}`
  })
  return `\n\n---\nCONTEXTO WEB — Busqué información actualizada sobre esta pregunta. Úsala como referencia y cita las fuentes cuando sea relevante:\n\n${lines.join('\n\n')}\n---`
}

// ============================================
// TÍTULO INTELIGENTE DEL HISTORIAL
// Genera un título corto y descriptivo (estilo Claude/ChatGPT) a partir
// del primer intercambio, en lugar de cortar el mensaje crudo a 60 chars.
// Es tolerante a fallos: si algo sale mal, devuelve un recorte limpio.
// ============================================
// Exportados para que el Modo Agente titule sus conversaciones EXACTAMENTE
// igual que el chat. Duplicar la lógica allí habría hecho que dos chats nacidos
// el mismo día se llamaran distinto según por dónde entraron.
export function cleanFallbackTitle(message: string): string {
  return message.replace(/\s+/g, ' ').trim().slice(0, 48) || 'Nueva conversación'
}

export async function generateSmartTitle(userMessage: string, assistantReply: string): Promise<string> {
  try {
    const sys = `Actúa como un sintetizador de intenciones de usuario. Analiza el intercambio y genera un título limpio, conciso y profesional para la conversación. Restricciones: máximo de 3 a 5 palabras, usa el mismo idioma del usuario, NO uses comillas, NO agregues punto final, NO uses texto introductorio ni la palabra "título". Devuelve ÚNICAMENTE el título.`
    const ask = `Mensaje del usuario: "${userMessage.slice(0, 500)}"
Respuesta del asistente: "${assistantReply.slice(0, 500)}"

Devuelve únicamente el título.`
    const raw = await chatSingle([{ role: 'user', content: ask }], 'claude', sys, getCheapModel())
    const title = (raw || '')
      .replace(/^\s*t[ií]tulo\s*:?\s*/i, '')   // quita un "Título:" inicial si aparece
      .replace(/^["'`#\s-]+|["'`\s.]+$/g, '')   // quita comillas/numeral/espacios en los bordes
      .replace(/\s+/g, ' ')
      .trim()
    if (!title) return cleanFallbackTitle(userMessage)
    // Capitaliza la primera letra y limita longitud
    const capped = title.charAt(0).toUpperCase() + title.slice(1)
    return capped.slice(0, 60)
  } catch {
    return cleanFallbackTitle(userMessage)
  }
}

// Ejecuta los 3 side-effects post-chat en paralelo con logging individual.
// Usar Promise.allSettled garantiza que todos corren aunque uno falle,
// y que los errores se loguean (antes .catch(()=>{}) los silenciaba).
async function runPostChatHooks(
  userId: string,
  userMessage: string,
  aiResponse: string,
  model: string
): Promise<void> {
  const hooks = await Promise.allSettled([
    import('../features/smartmemory/smartMemory').then(m => m.smartRemember(userId, userMessage, aiResponse)),
    import('../features/memoryskills/memorySkills').then(m => m.learnSkillFromExchange(userId, userMessage, aiResponse)),
    import('../features/insights/usageTracker').then(m =>
      m.trackUsage({ userId, model, inputText: userMessage, outputText: aiResponse, feature: 'chat' })
    ),
  ])
  for (const r of hooks) {
    if (r.status === 'rejected') console.warn('[chat hooks]', r.reason?.message || r.reason)
  }
}

// Red de seguridad para generación de imágenes (Capa 2).
// El frontend ya detecta la mayoría de peticiones de imagen y las maneja con
// Pollinations sin pasar por el modelo. Esto es el respaldo en el servidor: si una
// petición CLARA de imagen llega igual al chat (p. ej. frontend en caché antiguo),
// la interceptamos ANTES del modelo para que nunca responda "no puedo generar
// imágenes". Es conservador a propósito: solo dispara con palabra de imagen
// explícita, para no confundir mensajes normales. Devuelve el prompt o null.
function detectImageRequest(message: string): string | null {
  const m = message.trim()
  if (m.split(/\s+/).length > 60) return null // descripciones largas → probablemente no es "genera imagen"
  // Nunca tratar como imagen si pide texto/código/documento
  if (/\b(informe|reporte|resumen|texto|lista|carta|email|correo|ensayo|art[ií]culo|poema|cuento|c[oó]digo|funci[oó]n|script|tabla|f[oó]rmula|pdf|word|docx|excel|powerpoint|presentaci[oó]n)\b/i.test(m)) return null

  // verbo (con tolerancia a tildes) + palabra de imagen + descripción
  const r1 = m.match(
    /^(?:gen[eé]ra(?:me|dme)?|cr[eé]a(?:me|dme)?|dib[uú]j[ao](?:me)?|h[aá]z(?:me)?|p[ií]nta(?:me|dme)?|dis[eé][ñn]a(?:me|dme)?|imagina|make|create|draw|generate|d[aá]me|quiero|mu[eé]strame|ponme|necesito)\s+(?:(?:un[ao]?|el|la)\s+)?(?:imagen|foto|fotograf[ií]a|ilustraci[oó]n|dibujo|arte|dise[ñn]o|image|picture|photo|artwork|wallpaper|poster|logo|icono)\s*(?:de|del?|sobre|of|con|with|:)?\s*[:\-]?\s*(.+)/i
  )
  if (r1?.[1]?.trim()) return r1[1].trim().slice(0, 600)

  // "imagen de X" / "foto de X" / "retrato de X" sin verbo
  const r3 = m.match(/^(?:imagen|foto(?:graf[ií]a)?|ilustraci[oó]n|wallpaper|fondo\s+de\s+pantalla|retrato|arte)\s+(?:de|del?|sobre|con)\s+(.+)/i)
  if (r3?.[1]?.trim()) return r3[1].trim().slice(0, 600)

  return null
}

export const sendMessage = async (req: Request, res: Response) => {
  const userId = (req as any).userId
  const { message, conversationId, imageData, regenerate, webMode, thinkLevel } = req.body
  // Nivel de pensamiento (Rápido/Normal/Profundo). Default 'normal' = comportamiento actual.
  const think: 'fast' | 'normal' | 'deep' = (thinkLevel === 'fast' || thinkLevel === 'deep') ? thinkLevel : 'normal'

  if (!message?.trim()) return res.status(400).json({ error: 'Mensaje requerido' })
  if (message.length > 8000) return res.status(400).json({ error: 'El mensaje es demasiado largo (máximo 8000 caracteres).' })

  try {
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' })

    // === RED DE SEGURIDAD: GENERACIÓN DE IMAGEN (Capa 2) ===
    // Si es una petición clara de imagen que escapó del detector del frontend,
    // se la devolvemos al cliente para que la genere con Pollinations, en vez de
    // dejar que el modelo conteste "no puedo generar imágenes". No consume cupo de
    // mensajes ni crea conversación (igual que el flujo de imagen del frontend).
    if (!imageData && !regenerate) {
      const imgPrompt = detectImageRequest(message)
      if (imgPrompt) {
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
        res.setHeader('Cache-Control', 'no-cache, no-transform, no-store')
        res.setHeader('Connection', 'keep-alive')
        res.setHeader('X-Accel-Buffering', 'no')
        res.flushHeaders?.()
        res.write(`data: ${JSON.stringify({ imageRequest: true, prompt: imgPrompt })}\n\n`)
        res.end()
        return
      }
    }

    // === REINICIO AUTOMÁTICO DEL LÍMITE ===
    // FREE se reinicia cada día; planes de pago cada 30 días
    const { PLANS } = await import('../config/plans')
    // Caducidad: si el plan de pago venció, baja a FREE antes de calcular límites.
    const { resolveEffectivePlan } = await import('../services/quota')
    const effectivePlan = await resolveEffectivePlan(user as any)
    const planCfg = (PLANS as any)[effectivePlan] || PLANS.FREE
    const now = new Date()
    const lastReset = user.usageResetAt ? new Date(user.usageResetAt) : new Date(0)
    const msSince = now.getTime() - lastReset.getTime()
    const resetMs = planCfg.limitPeriod === 'day' ? 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000

    if (msSince >= resetMs) {
      await prisma.user.update({
        where: { id: userId },
        data: { messagesUsed: 0, imagesUsed: 0, searchesUsed: 0, studioUsed: 0, documentsUsed: 0, messagesLimit: planCfg.messageLimit, usageResetAt: now },
      })
      user.messagesUsed = 0
      user.messagesLimit = planCfg.messageLimit
    }

    // Límite atómico: increment solo si aún hay cupo — evita race condition entre
    // dos requests simultáneos que ambos pasen el check y ambos incrementen.
    const periodTxt = planCfg.limitPeriod === 'day' ? 'diario' : 'mensual'
    if (user.messagesUsed >= user.messagesLimit) {
      return res.status(429).json({ error: `Alcanzaste tu límite ${periodTxt} de mensajes. Mejora tu plan para continuar.` })
    }
    const reserved = await prisma.$executeRaw`
      UPDATE "User" SET "messagesUsed" = "messagesUsed" + 1
      WHERE id = ${userId}::"text" AND "messagesUsed" < "messagesLimit"
    `
    if ((reserved as number) === 0) {
      return res.status(429).json({ error: `Alcanzaste tu límite ${periodTxt} de mensajes. Mejora tu plan para continuar.` })
    }

    // Salvaguarda global anti-factura: tope diario de toda la plataforma (si se configura)
    const { checkGlobalBudget } = await import('../services/monitoring')
    if (!checkGlobalBudget()) {
      return res.status(503).json({ error: 'El servicio está temporalmente saturado. Intenta de nuevo más tarde.' })
    }

    // Obtener o crear conversación.
    // IMPORTANTE: se filtra por userId para que un usuario NO pueda leer ni
    // escribir en la conversación de otro pasando un conversationId ajeno.
    let conversation = conversationId
      ? await prisma.conversation.findFirst({ where: { id: conversationId, userId } })
      : null

    // ¿Es el primer intercambio? Solo entonces auto-generamos el título inteligente
    // (así nunca pisamos un nombre que el usuario haya cambiado a mano después).
    const isFirstExchange = !conversation

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          userId,
          title: cleanFallbackTitle(message),
          model: 'auto',
          mode: 'SINGLE',
        }
      })
    }

    // Historial: doble sort (createdAt + id) para orden determinista cuando
    // dos mensajes tienen el mismo timestamp (e.g. en test o batch inserts)
    // Historial: se piden 20 mensajes como máximo (antes 30). Menos historial
    // = menos tokens de entrada = menos coste por mensaje. Para conversaciones
    // largas se resume más abajo; el usuario no pierde el hilo y Daya gasta menos.
    let history = await prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 20,
      select: { id: true, role: true, content: true, createdAt: true },
    })

    let regenOldAssistantId: string | null = null
    if (regenerate) {
      // Al regenerar: NO duplicar el mensaje del usuario (ya existe). La última
      // respuesta del asistente se quita del historial que ve el modelo, pero NO se
      // borra todavía de la BD: solo se elimina si la nueva respuesta tiene éxito
      // (ver más abajo), para no perderla si el stream falla.
      const lastAssistant = [...history].reverse().find((m: any) => m.role === 'assistant')
      if (lastAssistant) {
        regenOldAssistantId = lastAssistant.id
        history = history.filter((m: any) => m.id !== lastAssistant.id)
      }
      // recortar historial para que termine en el último mensaje de usuario
      const lastUserIdx = history.map((m: any) => m.role).lastIndexOf('user')
      if (lastUserIdx >= 0) history = history.slice(0, lastUserIdx + 1)
    } else {
      // Flujo normal: guardar el mensaje del usuario
      await prisma.message.create({
        data: { conversationId: conversation.id, role: 'user', content: message }
      })
      history = [...history, { role: 'user', content: message } as any]
    }

    // Sistema de contexto y memoria
    let systemPrompt = await buildSystemPrompt(userId, message)

    // Seleccionar mejor modelo (antes del prompt injection para pasar el modelo).
    // classifyMessage: regex primero; si el mensaje es ambiguo, un mini-modelo
    // barato lo clasifica (timeout 1.2 s, fallback al regex — nunca bloquea).
    const userPlan = user.plan as any || 'FREE'
    const cls = await classifyMessage(message)
    const bestModel = selectBestModel(message, userPlan, !!imageData, cls)
    const taskType = cls.task

    // Inyectar instrucciones específicas del modelo para maximizar su potencial
    systemPrompt = injectModelInstructions(systemPrompt, bestModel, taskType)

    // Búsqueda web: forzada cuando el usuario activa el modo web (webMode), o
    // automática cuando la heurística detecta que la pregunta lo necesita (así el
    // chat normal también es inteligente). El modo forzado garantiza que SIEMPRE
    // busque, sin depender de la heurística.
    let webSearchTriggered = !imageData && (webMode === true || needsWebSearch(message))
    let webSearchSucceeded = false
    // Cuota de búsquedas: si se alcanzó el límite del plan, NO se bloquea el mensaje
    // (degrada con elegancia): se responde sin web y se avisa al usuario.
    let searchQuotaExhausted = false
    if (webSearchTriggered) {
      const { consumeQuota } = await import('../services/quota')
      const q = await consumeQuota(userId, 'search')
      if (!q.ok) {
        webSearchTriggered = false
        searchQuotaExhausted = true
      }
    }
    // Fuentes citadas: se anexan al final de la respuesta (tanto en modo web forzado
    // como en la búsqueda automática), para que el usuario SIEMPRE vea qué páginas se
    // consultaron — transparencia tipo "fuentes" de las IAs.
    let webSources: { title: string; url: string }[] = []
    if (webSearchTriggered) {
      try {
        const { searchAndRank } = await import('../features/searchrank/ranking')
        const results = await Promise.race([
          searchAndRank(message, webMode === true ? 6 : 5),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 12000)),
        ]).catch(() => [])
        const webCtx = buildWebContext(results as any[])
        if (webCtx) {
          systemPrompt += webCtx
          webSearchSucceeded = true
          // Recoger las fuentes SIEMPRE que la búsqueda dé resultados (forzada o
          // automática). Antes solo se recogían con webMode===true, así que la
          // búsqueda automática nunca mostraba qué páginas se consultaron.
          webSources = (results as any[])
            .filter(r => r?.url && r?.title)
            .slice(0, 6)
            .map(r => ({ title: String(r.title), url: String(r.url) }))
        }
      } catch { /* búsqueda fallida */ }
      // Si la búsqueda falló o no dio resultados, avisar a la IA para que lo diga al
      // usuario Y devolver la cuota: se cobró la búsqueda en consumeQuota pero no se
      // entregó ningún resultado, así que no debe contar contra su límite.
      if (!webSearchSucceeded) {
        systemPrompt += '\n\n[NOTA INTERNA: El usuario preguntó algo que requería información actualizada pero la búsqueda web no estuvo disponible. Avísale brevemente que tu respuesta se basa en tu conocimiento hasta tu fecha de corte y sugiere que use el Agente para búsquedas en tiempo real.]'
        const { refundQuota } = await import('../services/quota')
        await refundQuota(userId, 'search')
      }
    } else if (searchQuotaExhausted) {
      // Alcanzó su límite de búsquedas del período: responde con su conocimiento y avisa.
      systemPrompt += '\n\n[NOTA INTERNA: El usuario alcanzó su límite de búsquedas web del período de su plan. Responde con tu conocimiento e indícale brevemente que agotó sus búsquedas y que puede mejorar su plan para tener más.]'
    }

    // === SSE HEADERS — envío inmediato ===
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache, no-transform, no-store')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.setHeader('Transfer-Encoding', 'chunked')
    res.flushHeaders()

    // Desactivar Nagle — envía cada byte sin esperar acumular
    const socket = (res as any).socket
    if (socket) {
      socket.setNoDelay(true)
      socket.setTimeout(0)
    }

    // Detectar desconexión del cliente: para el stream para no seguir gastando tokens
    let clientGone = false
    req.on('close', () => { clientGone = true })

    res.write(`data: ${JSON.stringify({ conversationId: conversation.id })}\n\n`)

    // === HERRAMIENTAS AUTOMÁTICAS ===
    // Va DESPUÉS de abrir el stream y ANTES de escribir: así el usuario ve al
    // instante qué está haciendo Daya en vez de mirar un cursor parado varios
    // segundos, que es lo que pasaría si se resolviera todo antes de responder.
    //
    // Aquí NO se redacta nada: el planificador solo ejecuta herramientas y lo
    // que sacan entra como contexto. La respuesta la sigue escribiendo el modelo
    // de siempre y en streaming, así que el chat se siente igual de vivo.
    //
    // Si algo falla, se responde sin herramientas: perder una herramienta es un
    // peaje; quedarse sin respuesta, un fallo.
    const toolsUsed: string[] = []
    if (!imageData && needsTools(message)) {
      try {
        const { gatherToolContext } = await import('../features/agent/agent')
        const previo = history.slice(-4).map((m: any) => ({ role: m.role, content: String(m.content).slice(0, 2000) }))
        const { context } = await gatherToolContext(userId, message, previo as any, (tool) => {
          if (!tool || clientGone) return
          toolsUsed.push(tool)
          res.write(`data: ${JSON.stringify({ tool })}\n\n`)
          if (typeof (res as any).flush === 'function') (res as any).flush()
        })
        if (context) systemPrompt += context
      } catch { /* sin herramientas, pero con respuesta */ }
    }

    // El título inteligente se genera DESPUÉS del stream, usando el mensaje del
    // usuario + la respuesta real → títulos mucho más certeros (ver más abajo).

    // === HISTORIAL — con summarización para conversaciones largas ===
    // Si hay >10 mensajes (antes >16), los primeros se resumen en un bloque
    // de contexto. Menos tokens de entrada = menos coste. El usuario no pierde
    // el hilo porque los 6 mensajes más recientes van completos.
    let historyMessages: { role: 'user' | 'assistant'; content: string }[]
    if (history.length > 10) {
      const older = history.slice(0, history.length - 6)
      const recent = history.slice(-6)
      const summaryInput = older
        .map((m: any) => `${m.role === 'user' ? 'Usuario' : 'DAYA'}: ${m.content.slice(0, 300)}`)
        .join('\n')
      const summary = await chatSingle(
        [{ role: 'user', content: `Resume MUY CONCISO en máximo 120 palabras los temas y conclusiones:\n\n${summaryInput}` }],
        'fast', undefined, undefined, 250
      ).catch(() => '')
      historyMessages = [
        ...(summary ? [{ role: 'user' as const, content: `[Contexto de mensajes anteriores: ${summary}]` }] : []),
        ...recent.map((m: any) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      ]
    } else {
      historyMessages = history.map((m: any) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }))
    }

    // === STREAMING ===
    // Modo cadena: para tareas analíticas o documentales complejas en planes de pago,
    // un modelo especialista analiza primero (sin streaming) y Claude entrega la
    // respuesta final (con streaming). Resultado notoriamente mejor sin cambios de UX.
    const chainConfig = !imageData ? selectChain(message, userPlan) : null

    // Qué modelo responde. Se manda antes del primer token para que el indicador
    // de escritura pueda nombrarlo ("Claude está escribiendo…") en vez de un
    // "Pensando" anónimo. En modo cadena manda el que ESCRIBE, que es el que se lee.
    res.write(`data: ${JSON.stringify({ model: chainConfig ? chainConfig.writer : bestModel })}\n\n`)

    let fullResponse = ''
    let streamFailed = false

    // Keepalive: comentario SSE cada 15 s para que Railway/nginx no corten
    // la conexión en respuestas que el modelo tarda en empezar.
    const keepalive = setInterval(() => {
      if (!res.writableEnded) res.write(': heartbeat\n\n')
    }, 15_000)

    try {
      const responseStream = chainConfig
        ? chatChainStream(
            historyMessages,
            chainConfig.specialist,
            chainConfig.writer,
            systemPrompt,
            chainConfig.instruction
          )
        : chatStream(historyMessages, 'claude', systemPrompt, bestModel, imageData, think)

      for await (const part of responseStream) {
        if (clientGone) break
        if (typeof part === 'string') {
          // Texto visible: se muestra y se persiste.
          fullResponse += part
          res.write(`data: ${JSON.stringify({ chunk: part })}\n\n`)
        } else if (part && (part as any).__reasoning) {
          // Razonamiento (Profundo): se transmite para el bloque plegable, NO se persiste.
          res.write(`data: ${JSON.stringify({ reasoning: (part as any).__reasoning })}\n\n`)
        }
        if (typeof (res as any).flush === 'function') (res as any).flush()
      }
    } catch (streamErr: any) {
      streamFailed = true
      console.error('Stream error:', streamErr?.message)
      if (!clientGone) res.write(`data: ${JSON.stringify({ error: 'La IA tuvo un problema al responder. Intenta de nuevo.' })}\n\n`)
    } finally {
      clearInterval(keepalive)
    }

    // Si no se genero nada, tratarlo como fallo
    if (!fullResponse.trim()) streamFailed = true

    // Si la respuesta falló, DEVOLVER el mensaje al cupo: se reservó atómicamente
    // antes del stream pero no se entregó nada. Sin esto, cada fallo (y cada
    // reintento automático del frontend) descontaba un mensaje sin respuesta.
    if (streamFailed) {
      await prisma.$executeRaw`
        UPDATE "User" SET "messagesUsed" = GREATEST("messagesUsed" - 1, 0)
        WHERE id = ${userId}::"text"
      `.catch(() => {})
    }

    // Rastro de las herramientas usadas, con el mismo trato que las "Fuentes":
    // se manda como un chunk (se ve) y se suma a fullResponse (se guarda), para
    // que al reabrir la conversación se siga sabiendo qué hizo Daya y no parezca
    // que se sacó de la manga una tarea creada o un cálculo.
    if (!streamFailed && !clientGone && toolsUsed.length) {
      const unicas = Array.from(new Set(toolsUsed))
      const linea = `\n\n_Herramientas usadas: ${unicas.join(' → ')}_`
      fullResponse += linea
      res.write(`data: ${JSON.stringify({ chunk: linea })}\n\n`)
      if (typeof (res as any).flush === 'function') (res as any).flush()
    }

    // MODO WEB: anexar la sección "Fuentes" al final de la respuesta. Se envía como
    // un chunk más (se ve en el chat) y se suma a fullResponse (se persiste). Así el
    // usuario NOTA que DAYA buscó: respuesta con info actual + enlaces citados.
    if (!streamFailed && !clientGone && webSources.length) {
      const seen = new Set<string>()
      const items = webSources.filter(s => { if (seen.has(s.url)) return false; seen.add(s.url); return true })
      if (items.length) {
        const block = `\n\n---\n**Fuentes consultadas:**\n` + items.map(s => `- [${s.title}](${s.url})`).join('\n')
        fullResponse += block
        if (!clientGone) {
          res.write(`data: ${JSON.stringify({ chunk: block })}\n\n`)
          if (typeof (res as any).flush === 'function') (res as any).flush()
        }
      }
    }

    // Resuelve el título inteligente usando el mensaje + la respuesta real.
    // Margen amplio (6s) para que el modelo barato alcance a responder; si no,
    // cae a un respaldo limpio basado en el inicio del chat.
    let finalTitle: string | undefined
    if (isFirstExchange && !streamFailed) {
      finalTitle = await Promise.race([
        generateSmartTitle(message, fullResponse).catch(() => cleanFallbackTitle(message)),
        new Promise<string>((resolve) => setTimeout(() => resolve(cleanFallbackTitle(message)), 6000)),
      ])
      // Solo actualiza si el título sigue siendo el provisional (el usuario podría
      // haber renombrado el chat mientras el stream estaba en curso).
      await prisma.conversation.updateMany({
        where: { id: conversation.id, title: cleanFallbackTitle(message) },
        data: { title: finalTitle },
      }).catch(() => {})
    }

    // Fin del stream (incluye el título para que el sidebar lo muestre al instante)
    res.write(`data: ${JSON.stringify({ done: true, conversationId: conversation.id, failed: streamFailed, ...(finalTitle ? { title: finalTitle } : {}) })}\n\n`)
    res.end()

    // Solo guardar la respuesta y cobrar el mensaje si SI hubo respuesta valida
    if (!streamFailed) {
      // Regeneración exitosa: ahora sí se borra la respuesta anterior (se conservó
      // hasta aquí por si el stream fallaba) antes de guardar la nueva.
      if (regenOldAssistantId) {
        await prisma.message.delete({ where: { id: regenOldAssistantId } }).catch(() => {})
      }
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: 'assistant',
          content: fullResponse,
          model: bestModel
        }
      })
      // Sube updatedAt de la conversacion para que ordene arriba en el historial
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { updatedAt: new Date() },
      }).catch(() => {})
      // messagesUsed ya se incrementó atómicamente antes del stream (no repetir aquí)
      void runPostChatHooks(userId, message, fullResponse, bestModel)
    }

  } catch (error: any) {
    console.error('Chat error:', error.message)
    if (!res.headersSent) {
      res.status(500).json({ error: 'Error procesando mensaje' })
    } else {
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`)
      res.end()
    }
  }
}

// ============================================
// CONVERSATION CRUD
// ============================================

export const getConversations = async (req: Request, res: Response) => {
  const userId = (req as any).userId
  const limit = Math.min(parseInt((req.query.limit as string) || '30', 10), 50)
  const cursor = req.query.cursor as string | undefined
  try {
    const conversations = await prisma.conversation.findMany({
      where: { userId },
      orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }],
      take: limit + 1, // pedimos uno extra para saber si hay más páginas
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    })
    const hasMore = conversations.length > limit
    const page = hasMore ? conversations.slice(0, limit) : conversations
    const nextCursor = hasMore ? page[page.length - 1].id : null
    // Compatibilidad: si no se pidió paginación, devolver el array directo (como antes).
    if (!cursor && !req.query.limit) return res.json(page)
    res.json({ conversations: page, nextCursor, hasMore })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
}

export const renameConversation = async (req: Request, res: Response) => {
  const userId = (req as any).userId
  const { id } = req.params
  const { title, pinned } = req.body

  // Permite renombrar y/o fijar en la misma ruta PATCH
  const data: any = {}
  if (typeof title === 'string' && title.trim()) data.title = title.trim().slice(0, 100)
  if (typeof pinned === 'boolean') data.pinned = pinned
  if (Object.keys(data).length === 0) return res.status(400).json({ error: 'Nada que actualizar' })

  try {
    const result = await prisma.conversation.updateMany({ where: { id, userId }, data })
    if (result.count === 0) return res.status(404).json({ error: 'Conversación no encontrada' })
    res.json({ success: true, ...data })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
}

export const getConversation = async (req: Request, res: Response) => {
  const userId = (req as any).userId
  const { id } = req.params
  try {
    const conversation = await prisma.conversation.findFirst({
      where: { id, userId },
      include: { messages: { orderBy: { createdAt: 'asc' } } }
    })
    if (!conversation) return res.status(404).json({ error: 'Conversación no encontrada' })
    res.json(conversation)
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
}

export const deleteConversation = async (req: Request, res: Response) => {
  const userId = (req as any).userId
  const { id } = req.params
  try {
    await prisma.conversation.deleteMany({ where: { id, userId } })
    res.json({ success: true })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
}

// ============================================
// PERSISTIR UNA NOTA / TARJETA EN LA CONVERSACIÓN
// Se usa para que los DOCUMENTOS generados (y su petición) queden guardados
// en el historial y reaparezcan al reabrir el chat. Si no hay conversación,
// se crea una nueva con un título derivado de la petición.
// ============================================
export const saveDocNote = async (req: Request, res: Response) => {
  const userId = (req as any).userId
  const { conversationId, prompt, marker } = req.body as { conversationId?: string; prompt?: string; marker?: string }

  if (!marker || typeof marker !== 'string') {
    return res.status(400).json({ error: 'Falta el contenido a guardar' })
  }

  try {
    let conversation = conversationId
      ? await prisma.conversation.findFirst({ where: { id: conversationId, userId } })
      : null

    let created = false
    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          userId,
          title: cleanFallbackTitle(prompt || 'Documento generado'),
          model: 'auto',
          mode: 'SINGLE',
        },
      })
      created = true
    }

    // Guarda la petición original del usuario (solo al crear el chat, para no duplicar)
    if (prompt && created) {
      await prisma.message.create({
        data: { conversationId: conversation.id, role: 'user', content: prompt.slice(0, 8000) },
      })
    }

    // Guarda la tarjeta del documento como mensaje del asistente
    await prisma.message.create({
      data: { conversationId: conversation.id, role: 'assistant', content: marker.slice(0, 8000) },
    })

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    }).catch(() => {})

    res.json({ success: true, conversationId: conversation.id, title: conversation.title })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
}
