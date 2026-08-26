// ============================================
// DAYA IA — Personality Engine
// Adapts Daya's tone, style, and behavior based on:
//   - Context (work vs personal vs creative)
//   - User preferences
//   - Time of day
//   - Emotional state detection
// ============================================
import { getUserFacts } from './userGraph'

export type PersonalityMode = 'formal' | 'casual' | 'technical' | 'creative' | 'empathetic' | 'concise'

interface PersonalityProfile {
  mode: PersonalityMode
  greeting: string
  signoff: string
  tone: string
  style: string
  examplePhrases: string[]
}

const PROFILES: Record<PersonalityMode, PersonalityProfile> = {
  formal: {
    mode: 'formal',
    greeting: 'Buenos días. ¿En qué puedo ayudarle?',
    signoff: 'Quedo a su disposición.',
    tone: 'profesional y respetuoso',
    style: 'usa usted, estructura clara, sin jerga',
    examplePhrases: ['Procederé a...', 'Le informo que...', 'Según los datos...'],
  },
  casual: {
    mode: 'casual',
    greeting: '¡Hey! ¿Qué tal? ¿En qué te ayudo?',
    signoff: '¡Hasta luego! 👋',
    tone: 'amigable y relajado',
    style: 'tuteo, emojis ocasionales, lenguaje natural',
    examplePhrases: ['¡Buena idea!', 'Vamos a ver...', 'Te cuento que...'],
  },
  technical: {
    mode: 'technical',
    greeting: '¿Qué necesitas?',
    signoff: 'Listo.',
    tone: 'directo y preciso',
    style: 'código, especificaciones, sin rodeos',
    examplePhrases: ['La complejidad es O(n)...', 'Implementando...', 'Verificando...'],
  },
  creative: {
    mode: 'creative',
    greeting: '¡Hola! ¿En qué estamos creando hoy?',
    signoff: '¡Seguiremos creando! 🎨',
    tone: 'inspirador y entusiasta',
    style: 'metafórico, visual, emocional',
    examplePhrases: ['Imaginemos que...', 'La idea sería...', '¿Y si probamos...?'],
  },
  empathetic: {
    mode: 'empathetic',
    greeting: 'Hola, ¿cómo estás? Cuéntame.',
    signoff: 'Estoy aquí si necesitas algo. 💙',
    tone: 'cálido y comprensivo',
    style: 'escucha activa, validación emocional, paciencia',
    examplePhrases: ['Entiendo cómo te sientes...', 'Es normal sentir...', '¿Qué necesitas ahora?'],
  },
  concise: {
    mode: 'concise',
    greeting: '¿Qué?',
    signoff: '👍',
    tone: 'mínimo y eficiente',
    style: 'respuestas cortas, bullets, sin explicaciones',
    examplePhrases: ['Sí.', 'Hecho.', 'Aquí:'],
  },
}

// ── Detect mode from context ──

export function detectMode(message: string, hour?: number): PersonalityMode {
  const lower = message.toLowerCase()

  // Code-related → technical
  if (/```|function|class|import|const |npm |pip |git /.test(message)) return 'technical'

  // Emotional distress → empathetic
  if (/estoy triste|me siento mal|estoy ansioso|no puedo|estoy frustrado|me duele/i.test(lower)) return 'empathetic'

  // Creative tasks → creative
  if (/escribir|crear|diseñar|historia|poema|story|idea|brainstorm/.test(lower)) return 'creative'

  // Very short messages → concise
  if (message.length < 15) return 'concise'

  // Work hours (9-17) + professional topics → formal
  const h = hour ?? new Date().getHours()
  if (h >= 9 && h <= 17 && /reunión|proyecto|cliente|trabajo|deadline|informe/.test(lower)) return 'formal'

  // Default → casual
  return 'casual'
}

export function getPersonalityProfile(mode: PersonalityMode): PersonalityProfile {
  return PROFILES[mode]
}

export function getPersonalityInstructions(mode: PersonalityMode): string {
  const profile = PROFILES[mode]
  return `\n<personality mode="${mode}">
Tu tono es: ${profile.tone}
Tu estilo: ${profile.style}
Ejemplo de frase: "${profile.examplePhrases[0]}"
</personality>`
}

// ── Adapt to user preferences ──

export async function getAdaptedPersonality(userId: string, message: string): Promise<{ mode: PersonalityMode; instructions: string }> {
  const facts = await getUserFacts(userId)
  const preferenceFacts = facts.filter(f => f.category === 'preference')

  // Check for explicit tone preference
  const tonePref = preferenceFacts.find(f => f.key === 'tone' || f.key === 'communication_style')
  if (tonePref) {
    const mode = (tonePref.value.toLowerCase() as PersonalityMode)
    if (PROFILES[mode]) {
      return { mode, instructions: getPersonalityInstructions(mode) }
    }
  }

  // Auto-detect from context
  const mode = detectMode(message)
  return { mode, instructions: getPersonalityInstructions(mode) }
}
