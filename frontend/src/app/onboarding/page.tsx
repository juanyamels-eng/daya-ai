'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store'
import { api } from '@/lib/api'
import { Button, Card } from '@/components/ui'
import { Sparkles, ArrowRight, CheckCircle } from 'lucide-react'

const STEPS = [
  {
    question: '¿Cómo te llamas?',
    key: 'name',
    placeholder: 'Tu nombre',
    extractPattern: /(?:me llamo|soy|mi nombre es)\s+(.+?)(?:\.|,|\n|$)/i,
    factCategory: 'personal',
    factKey: 'name',
  },
  {
    question: '¿A qué te dedicas?',
    key: 'job',
    placeholder: 'Ej: desarrollador, diseñador, estudiante...',
    extractPattern: /(?:soy|trabajo como|mi trabajo es|me dedico a)\s+(.+?)(?:\.|,|\n|$)/i,
    factCategory: 'professional',
    factKey: 'job_title',
  },
  {
    question: '¿Qué te apasiona o qué haces en tu tiempo libre?',
    key: 'hobbies',
    placeholder: 'Ej: programar, leer, gaming, cocina...',
    extractPattern: /(?:me gusta|disfruto|hago|mi hobby es)\s+(.+?)(?:\.|,|\n|$)/i,
    factCategory: 'personal',
    factKey: 'hobbies',
  },
  {
    question: '¿Tienes algún objetivo o meta actual?',
    key: 'goal',
    placeholder: 'Ej: aprender React, lanzar mi negocio, mejorar en mi trabajo...',
    extractPattern: /(?:quiero|necesito|mi meta es|mi objetivo es|busco)\s+(.+?)(?:\.|,|\n|$)/i,
    factCategory: 'goal',
    factKey: 'current_goal',
  },
  {
    question: '¿Cómo prefiero que te hable?',
    key: 'tone',
    placeholder: 'Ej: directo, formal, casual, con emojis...',
    extractPattern: /(?:directo|formal|casual|amigable|técnico|con emojis|sin rodeos)/i,
    factCategory: 'preference',
    factKey: 'tone',
  },
]

export default function OnboardingPage() {
  const { hasHydrated, isAuthenticated } = useAuthStore()
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [inputValue, setInputValue] = useState('')
  const [completed, setCompleted] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (hasHydrated && !isAuthenticated()) router.push('/auth/login')
  }, [hasHydrated, isAuthenticated, router])

  const step = STEPS[currentStep]

  async function handleNext() {
    if (!inputValue.trim()) return

    const newAnswers = { ...answers, [step.key]: inputValue.trim() }
    setAnswers(newAnswers)

    if (currentStep < STEPS.length - 1) {
      setCurrentStep(prev => prev + 1)
      setInputValue('')
    } else {
      setSaving(true)
      try {
        // Save each answer as a fact in the UserGraph
        for (const s of STEPS) {
          const answer = newAnswers[s.key]
          if (!answer) continue

          // Try pattern extraction, fallback to raw value
          const match = answer.match(s.extractPattern)
          const value = match ? match[1].trim() : answer

          await api.post('/memory/feedback', {
            type: 'explicit',
            content: `${s.factKey.replace(/_/g, ' ')}: ${value}`,
            conversationId: 'onboarding',
          }).catch(() => {})

          // Also try to save via a direct fact injection approach
          await api.post('/memory/profile', {
            key: s.factKey,
            value,
            category: s.factCategory,
            source: 'onboarding',
          }).catch(() => {})
        }

        setCompleted(true)
      } catch {
        setCompleted(true)
      } finally {
        setSaving(false)
      }
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleNext()
    }
  }

  if (!hasHydrated) return null

  if (completed) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Card style={{ padding: '3rem', textAlign: 'center', maxWidth: 500, border: '1px solid var(--border-default)' }}>
          <CheckCircle size={48} style={{ color: '#10b981', marginBottom: 16 }} />
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 8 }}>¡Listo! Ya te conozco mejor</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
            Ahora personalizaré mis respuestas según tus preferencias. Puedes contarme más cosas sobre ti en cualquier momento.
          </p>
          <Button onClick={() => router.push('/dashboard')} style={{ width: '100%' }}>
            Ir al Dashboard <ArrowRight size={16} style={{ marginLeft: 8 }} />
          </Button>
        </Card>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ maxWidth: 520, width: '100%', padding: '2rem' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <Sparkles size={32} style={{ color: 'var(--accent-500)', marginBottom: 8 }} />
          <h1 style={{ fontSize: '1.6rem', fontWeight: 700 }}>Hola, soy Daya</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: 4 }}>
            Para ayudarte mejor, me gustaría conocerte un poco.
          </p>
        </div>

        {/* Progress */}
        <div style={{ display: 'flex', gap: 6, marginBottom: '2rem', justifyContent: 'center' }}>
          {STEPS.map((_, i) => (
            <div
              key={i}
              style={{
                width: 32,
                height: 4,
                borderRadius: 2,
                background: i <= currentStep ? 'var(--accent-500)' : 'var(--border-default)',
                transition: 'background 0.3s',
              }}
            />
          ))}
        </div>

        {/* Question */}
        <Card style={{ padding: '2rem', border: '1px solid var(--border-default)' }}>
          <p style={{ fontWeight: 600, fontSize: '1.1rem', marginBottom: 16 }}>
            {step.question}
          </p>
          <input
            type="text"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={step.placeholder}
            autoFocus
            style={{
              width: '100%',
              padding: '12px 16px',
              fontSize: '1rem',
              background: 'var(--bg-base)',
              border: '1px solid var(--border-default)',
              borderRadius: 8,
              color: 'var(--text-primary)',
              outline: 'none',
              marginBottom: 16,
            }}
          />
          <Button
            onClick={handleNext}
            disabled={!inputValue.trim() || saving}
            style={{ width: '100%' }}
          >
            {currentStep < STEPS.length - 1 ? 'Siguiente' : 'Completar'}
            <ArrowRight size={16} style={{ marginLeft: 8 }} />
          </Button>
        </Card>

        {/* Skip */}
        <p style={{ textAlign: 'center', marginTop: 16 }}>
          <button
            onClick={() => router.push('/dashboard')}
            style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: '0.85rem' }}
          >
            Omitir por ahora
          </button>
        </p>
      </div>
    </div>
  )
}
