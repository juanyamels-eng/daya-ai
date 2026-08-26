import { Router } from 'express'
import { requireAuth } from '../../middleware/auth'
import { prisma } from '../../lib/prisma'

const db = prisma
const router = Router()

/**
 * GET /api/widget/config — Get widget configuration (auth required)
 */
router.get('/config', requireAuth, async (req: any, res) => {
  try {
    const row = await db.dayaSystemConfig.findUnique({
      where: { key: `widget:${req.userId}` },
    })
    const config = row ? JSON.parse(row.value) : {
      primaryColor: '#6d5cff',
      greeting: 'Hola, soy DAYA. ¿En qué te puedo ayudar?',
      position: 'bottom-right',
      model: 'claude-3.5-sonnet',
      title: 'DAYA Assistant',
    }
    res.json({ config, token: `dy_wgt_${req.userId.slice(0, 8)}` })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Error' })
  }
})

/**
 * PUT /api/widget/config — Update widget configuration (auth required)
 */
router.put('/config', requireAuth, async (req: any, res) => {
  try {
    const { primaryColor, greeting, position, model, title } = req.body
    const config = {
      primaryColor: primaryColor || '#6d5cff',
      greeting: greeting || 'Hola, soy DAYA. ¿En qué te puedo ayudar?',
      position: position || 'bottom-right',
      model: model || 'claude-3.5-sonnet',
      title: title || 'DAYA Assistant',
    }
    await db.dayaSystemConfig.upsert({
      where: { key: `widget:${req.userId}` },
      update: { value: JSON.stringify(config) },
      create: { key: `widget:${req.userId}`, value: JSON.stringify(config) },
    })
    res.json({ config })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Error' })
  }
})

/**
 * POST /api/widget/chat — Public chat endpoint (no auth, uses widget token)
 */
router.post('/chat', async (req: any, res: any) => {
  try {
    const { message, token, conversationId } = req.body
    if (!message || !token) {
      return res.status(400).json({ error: 'message and token required' })
    }

    // Extract userId from widget token
    const userId = token.replace('dy_wgt_', '')
    const user = await db.user.findUnique({ where: { id: userId } })
    if (!user) return res.status(404).json({ error: 'Widget not found' })

    // Get or create conversation
    let convId = conversationId
    if (!convId) {
      const conv = await db.conversation.create({
        data: { userId, title: 'Widget Chat', model: 'claude-3-5-sonnet' },
      })
      convId = conv.id
    }

    // Store user message
    await db.message.create({
      data: { conversationId: convId, role: 'user', content: message },
    })

    // Generate AI response (simplified for widget)
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://daya.ai',
      },
      body: JSON.stringify({
        model: 'anthropic/claude-3.5-sonnet',
        messages: [
          { role: 'system', content: 'Eres DAYA, un asistente de IA amigable y profesional. Responde en español de forma concisa y útil.' },
          { role: 'user', content: message },
        ],
        max_tokens: 500,
      }),
    })

    const data = await response.json()
    const reply = data.choices?.[0]?.message?.content || 'Disculpa, no pude procesar tu mensaje.'

    // Store assistant message
    await db.message.create({
      data: { conversationId: convId, role: 'assistant', content: reply },
    })

    res.json({ reply, conversationId: convId })
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Error' })
  }
})

/**
 * GET /api/widget/embed/:token — Serve embed script
 */
router.get('/embed/:token', (req, res) => {
  const token = req.params.token
  const base = process.env.FRONTEND_URL || 'http://localhost:3000'

  const script = `
(function(){
  var t="${token}";
  var f=document.createElement("div");
  f.id="daya-widget";
  f.style.cssText="position:fixed;bottom:20px;right:20px;z-index:9999;";
  var b=document.createElement("button");
  b.innerHTML="💬";
  b.style.cssText="width:60px;height:60px;border-radius:50%;background:#6d5cff;border:none;color:#fff;font-size:28px;cursor:pointer;box-shadow:0 4px 20px rgba(109,92,255,0.4);transition:transform 0.2s;";
  b.onmouseover=function(){b.style.transform="scale(1.1)"};
  b.onmouseout=function(){b.style.transform="scale(1)"};
  var o=false;
  var ifr;
  b.onclick=function(){
    if(o){ifr.remove();o=false;b.innerHTML="💬";return}
    ifr=document.createElement("iframe");
    ifr.src="${base}/widget?token="+t;
    ifr.style.cssText="position:fixed;bottom:90px;right:20px;width:380px;height:520px;border:none;border-radius:16px;box-shadow:0 10px 40px rgba(0,0,0,0.2);z-index:10000;";
    document.body.appendChild(ifr);
    o=true;b.innerHTML="✕";
  };
  f.appendChild(b);
  document.body.appendChild(f);
})();`
  res.setHeader('Content-Type', 'application/javascript')
  res.send(script)
})

export default router
