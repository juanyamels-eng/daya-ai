'use client'
import { useState, useEffect, useCallback } from 'react'
import { ollamaAPI } from '../../lib/api'
import { useT } from '../../lib/i18n'
import { toast } from '../../lib/toast'

interface OllamaModel {
  id: string
  name: string
  size: number
  modified_at: string
  capabilities: {
    vision: boolean
    tools: boolean
    reasoning: boolean
    maxContext: number
  }
  installed: boolean
}

interface RecommendedModel {
  name: string
  description: string
  size: string
  installed: boolean
}

export default function ModelSelector({ onSelect, currentModel, onClose }: { 
  onSelect: (modelId: string) => void
  currentModel?: string
  onClose?: () => void
}) {
  const t = useT()
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([])
  const [recommendedModels, setRecommendedModels] = useState<RecommendedModel[]>([])
  const [loading, setLoading] = useState(true)
  const [pulling, setPulling] = useState<string | null>(null)
  const [pullProgress, setPullProgress] = useState<{ completed: number; total: number; status: string } | null>(null)
  const [activeTab, setActiveTab] = useState<'installed' | 'recommended'>('installed')

  const loadModels = useCallback(async () => {
    try {
      const [ollamaRes, recommendedRes] = await Promise.all([
        ollamaAPI.listModels(),
        ollamaAPI.getRecommended(),
      ])
      setOllamaModels(ollamaRes.data.models || [])
      setRecommendedModels(recommendedRes.data.recommended || [])
    } catch (e) {
      console.error('Failed to load Ollama models:', e)
      toast(t('models.loadError') || 'Error cargando modelos', 'error')
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    loadModels()
  }, [loadModels])

  const handlePull = async (modelName: string) => {
    setPulling(modelName)
    setPullProgress({ completed: 0, total: 0, status: 'starting' })

    try {
      const res = await ollamaAPI.pullModel(modelName)
      
      // Handle streaming response
      const reader = res.data.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let newlineIdx
        while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, newlineIdx).trim()
          buffer = buffer.slice(newlineIdx + 1)
          if (!line.startsWith('data: ')) continue
          try {
            const parsed = JSON.parse(line.slice(6))
            if (parsed.completed !== undefined && parsed.total !== undefined) {
              setPullProgress({ 
                completed: parsed.completed, 
                total: parsed.total, 
                status: parsed.status || 'downloading' 
              })
            }
            if (parsed.done) {
              toast(`${t('models.pulledSuccess')} ${modelName}` || `Modelo ${modelName} descargado`, 'success')
              await loadModels()
            }
            if (parsed.error) {
              throw new Error(parsed.error)
            }
          } catch {
            // Ignore parse errors
          }
        }
      }
      reader.releaseLock()
    } catch (e) {
      console.error('Pull failed:', e)
      toast(`${t('models.pullError')} ${modelName}` || `Error descargando ${modelName}`, 'error')
    } finally {
      setPulling(null)
      setPullProgress(null)
    }
  }

  const handleDelete = async (modelName: string) => {
    if (!confirm(`${t('models.confirmDelete')} ${modelName}?`)) return
    try {
      await ollamaAPI.deleteModel(modelName)
      toast(`${t('models.deleted')} ${modelName}` || `Modelo ${modelName} eliminado`, 'success')
      await loadModels()
    } catch (e) {
      toast(t('models.deleteError') || 'Error eliminando modelo', 'error')
    }
  }

  const formatSize = (bytes: number) => {
    const gb = bytes / (1024 ** 3)
    return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / (1024 ** 2)).toFixed(0)} MB`
  }

  const capabilityBadge = (cap: { vision: boolean; tools: boolean; reasoning: boolean; maxContext: number }) => [
    cap.vision && '👁️ Visión',
    cap.tools && '🔧 Tools',
    cap.reasoning && '🧠 Reasoning',
    cap.maxContext >= 100000 && '📏 1M ctx',
    cap.maxContext >= 16000 && '📏 16K ctx',
  ].filter(Boolean).join(' • ')

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <span className="ml-3 text-muted">{t('models.loading') || 'Cargando modelos...'}</span>
      </div>
    )
  }

  return (
    <div className="w-full max-w-2xl">
      {/* Tabs */}
      <div className="flex border-b border-border mb-4">
        <button
          onClick={() => setActiveTab('installed')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'installed' 
              ? 'border-primary text-primary' 
              : 'border-transparent text-muted hover:text-fg'
          }`}
        >
          {t('models.installed') || 'Instalados'} ({ollamaModels.length})
        </button>
        <button
          onClick={() => setActiveTab('recommended')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'recommended' 
              ? 'border-primary text-primary' 
              : 'border-transparent text-muted hover:text-fg'
          }`}
        >
          {t('models.recommended') || 'Recomendados'} ({recommendedModels.length})
        </button>
      </div>

      {/* Model List */}
      <div className="max-h-96 overflow-y-auto space-y-2">
        {activeTab === 'installed' ? (
          ollamaModels.length === 0 ? (
            <div className="text-center py-8 text-muted">
              <p>{t('models.noInstalled') || 'No hay modelos instalados'}</p>
              <p className="text-sm mt-1">{t('models.installHint') || 'Ve a la pestaña "Recomendados" para descargar alguno'}</p>
            </div>
          ) : (
            ollamaModels.map((model) => (
              <div
                key={model.id}
                className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                  currentModel === model.id 
                    ? 'border-primary bg-primary/5' 
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{model.name}</span>
                    {currentModel === model.id && (
                      <span className="px-2 py-0.5 text-xs bg-primary text-primary-fg rounded">
                        {t('models.current') || 'Actual'}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-sm text-muted mt-1">
                    <span>{formatSize(model.size)}</span>
                    <span>{capabilityBadge(model.capabilities)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  {currentModel !== model.id && (
                    <button
                      onClick={() => onSelect(model.id)}
                      className="px-3 py-1.5 text-sm bg-primary text-primary-fg rounded hover:opacity-90 transition"
                    >
                      {t('models.select') || 'Usar'}
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(model.id)}
                    disabled={currentModel === model.id}
                    className="px-3 py-1.5 text-sm border border-border rounded hover:bg-destructive/10 hover:border-destructive hover:text-destructive transition disabled:opacity-50"
                  >
                    {t('models.delete') || 'Eliminar'}
                  </button>
                </div>
              </div>
            ))
          )
        ) : (
          recommendedModels.length === 0 ? (
            <div className="text-center py-8 text-muted">
              <p>{t('models.noRecommended') || 'No hay recomendaciones disponibles'}</p>
            </div>
          ) : (
            recommendedModels.map((model) => (
              <div
                key={model.name}
                className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                  currentModel === model.name 
                    ? 'border-primary bg-primary/5' 
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{model.name}</span>
                    {model.installed && (
                      <span className="px-2 py-0.5 text-xs bg-green-500/20 text-green-500 rounded">
                        {t('models.installed') || 'Instalado'}
                      </span>
                    )}
                    {currentModel === model.name && !model.installed && (
                      <span className="px-2 py-0.5 text-xs bg-primary text-primary-fg rounded">
                        {t('models.current') || 'Actual'}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-muted mt-1">{model.description}</div>
                  <div className="text-xs text-muted mt-0.5">Tamaño estimado: {model.size}</div>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  {currentModel !== model.name && !model.installed && !pulling && (
                    <button
                      onClick={() => handlePull(model.name)}
                      className="px-3 py-1.5 text-sm bg-primary text-primary-fg rounded hover:opacity-90 transition"
                    >
                      {t('models.download') || 'Descargar'}
                    </button>
                  )}
                  {pulling === model.name && pullProgress && (
                    <div className="flex items-center gap-2 text-sm text-muted">
                      <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all"
                          style={{ width: `${pullProgress.total > 0 ? (pullProgress.completed / pullProgress.total) * 100 : 0}%` }}
                        />
                      </div>
                      <span>{pullProgress.completed}/{pullProgress.total}</span>
                    </div>
                  )}
                  {currentModel === model.name && !model.installed && (
                    <span className="px-3 py-1.5 text-sm bg-primary text-primary-fg rounded opacity-50 cursor-not-allowed">
                      {t('models.current') || 'Actual'}
                    </span>
                  )}
                  {model.installed && currentModel !== model.name && (
                    <button
                      onClick={() => onSelect(model.name)}
                      className="px-3 py-1.5 text-sm border border-border rounded hover:bg-destructive/10 hover:border-destructive hover:text-destructive transition"
                    >
                      {t('models.select') || 'Usar'}
                    </button>
                  )}
                </div>
              </div>
            ))
          )
        )}

        {/* Pull progress modal overlay */}
        {pulling && pullProgress && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-bg p-6 rounded-lg border w-96">
              <h3 className="font-medium mb-4">{t('models.downloading') || 'Descargando'} {pulling}</h3>
              <div className="w-full h-3 bg-muted rounded-full overflow-hidden mb-2">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${pullProgress.total > 0 ? (pullProgress.completed / pullProgress.total) * 100 : 0}%` }}
                />
              </div>
              <p className="text-sm text-muted">{pullProgress.status} - {pullProgress.completed}/{pullProgress.total}</p>
            </div>
          </div>
        )}
      </div>

      <button
        onClick={onClose}
        className="w-full mt-4 px-4 py-2 text-sm border border-border rounded hover:bg-muted transition"
      >
        {t('models.close') || 'Cerrar'}
      </button>
    </div>
  )
}